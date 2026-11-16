import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPosCatalog } from "@/lib/pos/catalog";
import { syncOrderConsumption } from "@/lib/pos/stock";
import { enBurbujas, responderWhatsapp, type CambiosFicha, type FichaCliente, type Turno } from "@/lib/ai/whatsapp-agent";
import { enviarReaccion, enviarTexto, marcarLeidoEscribiendo, type Eco, type Entrante, type EstadoEntrega } from "./cloud-api";
import { guardarPedidoWhatsapp, validarPedido } from "./pedido";
import { atiendeA } from "./probadores";
import { enlazarClaves, esTelefono, telefonoDe, usuario, type ClavesCliente, type FilaClaves } from "./ficha";

/**
 * What happens to a webhook once Meta's signature checked out.
 *
 * `registrar` runs inside the request: it stores every message once (Meta
 * retries, `wa_message_id` is unique) and returns the customer messages that
 * still need an answer. `responder` runs after the 200 went back: it waits a
 * few seconds so a customer who types in bursts gets one answer, then lets the
 * agent reply — unless someone from the team is already in the chat.
 */
const ESPERA_RAFAGA_MS = 4_000;
/** The team wrote from the phone: the agent steps back this long. */
const PAUSA_EQUIPO_MS = 2 * 60 * 60 * 1000;
/** Handed over to a person: the agent stays out until the team is done. */
const PAUSA_HUMANO_MS = 12 * 60 * 60 * 1000;
const HISTORIAL_HORAS = 24;
const HISTORIAL_MAX = 40;

type Numero = {
  phone_number_id: string;
  organization_id: string;
  restaurant_id: string;
  direccion: string | null;
  horario: string | null;
  domicilios: string | null;
  pagos: string | null;
  agente_activo: boolean;
};

const db = () => createSupabaseAdminClient();

async function numero(phoneNumberId: string): Promise<Numero | null> {
  const { data, error } = await db()
    .from("whatsapp_numeros")
    .select("phone_number_id, organization_id, restaurant_id, direccion, horario, domicilios, pagos, agente_activo")
    .eq("phone_number_id", phoneNumberId)
    .maybeSingle();
  if (error) console.error("[whatsapp] numero:", error);
  return (data as Numero | null) ?? null;
}

async function conversacion(
  n: Numero,
  waId: string,
  nombre: string | null,
  entrante: Date | null,
  ids: { userId?: string | null; username?: string | null } = {},
): Promise<string | null> {
  const { data, error } = await db()
    .from("whatsapp_conversaciones")
    .upsert(
      {
        organization_id: n.organization_id,
        phone_number_id: n.phone_number_id,
        wa_id: waId,
        ...(nombre ? { nombre } : {}),
        ...(ids.userId ? { user_id: ids.userId } : {}),
        ...(ids.username ? { username: ids.username } : {}),
        ...(entrante ? { ultimo_entrante_at: entrante.toISOString() } : {}),
      },
      { onConflict: "phone_number_id,wa_id" },
    )
    .select("id")
    .single();
  if (error) console.error("[whatsapp] conversacion:", error);
  return (data?.id as string | undefined) ?? null;
}

/** Insert once; false when Meta already delivered this message. */
async function guardarMensaje(row: {
  organization_id: string;
  conversacion_id: string;
  wa_message_id: string | null;
  autor: Turno["autor"];
  texto: string;
  orden_id?: string | null;
  estado?: EstadoEntrega["estado"];
  error?: string;
  estado_at?: string;
}): Promise<boolean> {
  const { error } = await db().from("whatsapp_mensajes").insert(row);
  if (error?.code === "23505") return false;
  if (error) {
    console.error("[whatsapp] mensaje:", error);
    return false;
  }
  return true;
}

const textoCliente = (e: Entrante) =>
  e.texto ?? `[El cliente envió ${e.tipo === "audio" ? "un audio" : e.tipo === "image" ? "una imagen" : e.tipo === "location" ? "una ubicación" : "un mensaje"} que no puedes ver; pídele que lo escriba.]`;

export interface Pendiente {
  phoneNumberId: string;
  waId: string;
  conversacionId: string;
  messageId: string;
}

export async function registrar(entrantes: Entrante[], ecos: Eco[]): Promise<Pendiente[]> {
  const pendientes: Pendiente[] = [];
  for (const e of entrantes) {
    const n = await numero(e.phoneNumberId);
    if (!n) {
      console.warn("[whatsapp] número sin configurar:", e.phoneNumberId);
      continue;
    }
    const convId = await conversacion(n, e.waId, e.nombre, e.at, { userId: e.userId, username: e.username });
    if (!convId) continue;
    const nuevo = await guardarMensaje({
      organization_id: n.organization_id,
      conversacion_id: convId,
      wa_message_id: e.messageId,
      autor: "cliente",
      texto: textoCliente(e),
    });
    if (nuevo) pendientes.push({ phoneNumberId: e.phoneNumberId, waId: e.waId, conversacionId: convId, messageId: e.messageId });
  }
  for (const e of ecos) {
    const n = await numero(e.phoneNumberId);
    if (!n) continue;
    const convId = await conversacion(n, e.waId, null, null);
    if (!convId) continue;
    const nuevo = await guardarMensaje({
      organization_id: n.organization_id,
      conversacion_id: convId,
      wa_message_id: e.messageId,
      autor: "equipo",
      texto: e.texto ?? "[mensaje del equipo]",
    });
    if (nuevo) {
      await db()
        .from("whatsapp_conversaciones")
        .update({ agente_pausado_hasta: new Date(Date.now() + PAUSA_EQUIPO_MS).toISOString() })
        .eq("id", convId);
    }
  }
  return pendientes;
}

/** Pause between bubbles, like someone typing: longer for longer messages. */
const pausaEscribiendo = (texto: string) => Math.min(4_000, 700 + texto.length * 30);
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

const CAMPOS_FICHA = "id, wa_id, user_id, username, trato, habitual, entrega, pago, notas";
type FilaFicha = FilaClaves & { id: string } & Partial<Record<keyof CambiosFicha, string | null>>;

/**
 * Their file by phone, then by business-scoped id, then by @username (one
 * the owner may have pre-loaded); the keys it lacks are filled in on the way.
 */
async function buscarFicha(orgId: string, c: ClavesCliente): Promise<FilaFicha | null> {
  const base = () => db().from("whatsapp_clientes").select(CAMPOS_FICHA).eq("organization_id", orgId);
  let fila = ((await base().eq("wa_id", c.waId).maybeSingle()).data as FilaFicha | null) ?? null;
  if (!fila && c.userId) fila = ((await base().eq("user_id", c.userId).maybeSingle()).data as FilaFicha | null) ?? null;
  const u = usuario(c.username);
  if (!fila && u) fila = ((await base().ilike("username", u.replace(/[\\%_]/g, (x) => `\\${x}`)).maybeSingle()).data as FilaFicha | null) ?? null;
  if (!fila) return null;
  const cambios = enlazarClaves(fila, c);
  if (Object.keys(cambios).length) {
    const { error } = await db().from("whatsapp_clientes").update({ ...cambios, updated_at: new Date().toISOString() }).eq("id", fila.id);
    if (error) console.error("[whatsapp] enlazar ficha:", error);
    else Object.assign(fila, cambios);
  }
  return fila;
}

/** The customer's file plus their latest WhatsApp orders, in words. */
async function cargarFicha(orgId: string, c: ClavesCliente, perfil: string | null): Promise<{ ficha: FichaCliente; filaId: string | null }> {
  const f = await buscarFicha(orgId, c);
  const tel = telefonoDe(c, f);
  const { data: ords } = tel
    ? await db()
        .from("ordenes")
        .select("folio, status, created_at, order_type, delivery_address, orden_items(name, qty)")
        .eq("organization_id", orgId)
        .eq("customer_phone", tel)
        .neq("status", "cancelada")
        .order("created_at", { ascending: false })
        .limit(3)
    : { data: [] };
  const pedidos = ((ords ?? []) as { folio: string; status: string; created_at: string; order_type: string; delivery_address: string | null; orden_items: { name: string; qty: number }[] }[]).map((o) => {
    const dia = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(o.created_at));
    const items = (o.orden_items ?? []).map((i) => `${i.qty} ${i.name}`).join(", ");
    return `${o.folio} · ${dia} · ${o.status}: ${items}${o.order_type === "domicilio" && o.delivery_address ? ` (a ${o.delivery_address})` : ""}`;
  });
  return {
    filaId: f?.id ?? null,
    ficha: {
      perfil,
      trato: f?.trato ?? null,
      habitual: f?.habitual ?? null,
      entrega: f?.entrega ?? null,
      pago: f?.pago ?? null,
      notas: f?.notas ?? null,
      pedidos,
    },
  };
}

const ahoraYopal = () =>
  new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "full", timeStyle: "short" }).format(new Date());

export async function responder(p: Pendiente): Promise<void> {
  // Checked before the read receipt: a customer the agent won't answer must
  // not see "escribiendo…".
  const antes = await numero(p.phoneNumberId);
  if (!antes || !atiendeA(antes.agente_activo, p.waId)) return;
  await marcarLeidoEscribiendo(p.phoneNumberId, p.messageId);
  await new Promise((r) => setTimeout(r, ESPERA_RAFAGA_MS));

  const n = await numero(p.phoneNumberId);
  if (!n || !atiendeA(n.agente_activo, p.waId)) return;
  const { data: conv } = await db()
    .from("whatsapp_conversaciones")
    .select("agente_pausado_hasta, nombre, username, user_id")
    .eq("id", p.conversacionId)
    .single();
  if (conv?.agente_pausado_hasta && new Date(conv.agente_pausado_hasta as string) > new Date()) return;

  const desde = new Date(Date.now() - HISTORIAL_HORAS * 60 * 60 * 1000).toISOString();
  const { data: filas } = await db()
    .from("whatsapp_mensajes")
    .select("autor, texto, wa_message_id")
    .eq("conversacion_id", p.conversacionId)
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(HISTORIAL_MAX);
  const turnos = ((filas ?? []) as { autor: Turno["autor"]; texto: string; wa_message_id: string | null }[]).reverse();
  // A later message of the burst arrived: its own run answers all of them.
  const ultimoCliente = [...turnos].reverse().find((t) => t.autor === "cliente");
  if (ultimoCliente?.wa_message_id !== p.messageId) return;

  const { data: org } = await db().from("organizations").select("name, instagram").eq("id", n.organization_id).single();
  const orgName = ((org?.name as string | undefined) ?? "").replace(/'s org$/, "") || "el café";
  const catalog = await getPosCatalog({ organizationId: n.organization_id, userId: null, orgName, client: db() });

  const claves: ClavesCliente = {
    waId: p.waId,
    userId: (conv?.user_id as string | null) ?? null,
    username: (conv?.username as string | null) ?? null,
  };
  const cargada = await cargarFicha(n.organization_id, claves, (conv?.nombre as string | null) ?? null);
  const ficha = cargada.ficha;
  let filaId = cargada.filaId;
  let ordenId: string | null = null;
  const res = await responderWhatsapp({
    catalog,
    local: {
      nombre: orgName,
      direccion: n.direccion,
      horario: n.horario,
      domicilios: n.domicilios,
      instagram: ((org?.instagram as string | null) ?? "").replace(/^@/, "") || null,
      pagos: n.pagos,
    },
    ficha,
    turnos,
    ahora: ahoraYopal(),
    herramientas: {
      crearPedido: async (pedido) => {
        const v = validarPedido(catalog, pedido);
        if (!v.ok) return v;
        const r = await guardarPedidoWhatsapp(db(), { organizationId: n.organization_id, restaurantId: n.restaurant_id, telefono: p.waId }, pedido, v);
        if (!r.ok) return r;
        ordenId = r.ordenId;
        await syncOrderConsumption(db(), n.organization_id, r.ordenId, null);
        await avisarPos(n.organization_id);
        return { ok: true, folio: r.folio, total: v.subtotal };
      },
      recordarCliente: async (cambios) => {
        // Update the file we recognised; only a brand-new customer gets a row.
        const ahora = new Date().toISOString();
        if (filaId) {
          const { error } = await db().from("whatsapp_clientes").update({ ...cambios, updated_at: ahora }).eq("id", filaId);
          if (error) console.error("[whatsapp] ficha:", error);
          return;
        }
        const { data, error } = await db()
          .from("whatsapp_clientes")
          .insert({
            organization_id: n.organization_id,
            wa_id: p.waId,
            user_id: claves.userId ?? (esTelefono(p.waId) ? null : p.waId),
            username: usuario(claves.username),
            ...cambios,
            updated_at: ahora,
          })
          .select("id")
          .single();
        if (error) console.error("[whatsapp] ficha:", error);
        filaId = (data?.id as string | undefined) ?? null;
      },
      pasarAHumano: async (motivo) => {
        console.info("[whatsapp] a humano:", p.waId, motivo);
        await db()
          .from("whatsapp_conversaciones")
          .update({ agente_pausado_hasta: new Date(Date.now() + PAUSA_HUMANO_MS).toISOString() })
          .eq("id", p.conversacionId);
      },
    },
  });
  if (res.reaccion) await enviarReaccion(p.phoneNumberId, p.waId, p.messageId, res.reaccion);
  const burbujas = enBurbujas(res.texto);
  for (const [i, burbuja] of burbujas.entries()) {
    if (i > 0) {
      // «escribiendo…» again, then a pause the size of the message.
      await marcarLeidoEscribiendo(p.phoneNumberId, p.messageId);
      await dormir(pausaEscribiendo(burbuja));
    }
    let waId: string | null = null;
    let fallo: string | null = null;
    try {
      waId = await enviarTexto(p.phoneNumberId, p.waId, burbuja);
    } catch (e) {
      fallo = (e instanceof Error ? e.message : String(e)).slice(0, 500);
      console.error("[whatsapp] envío:", fallo);
    }
    await guardarMensaje({
      organization_id: n.organization_id,
      conversacion_id: p.conversacionId,
      wa_message_id: waId,
      autor: "agente",
      texto: burbuja,
      orden_id: i === 0 ? ordenId : null,
      ...(fallo ? { estado: "failed", error: fallo, estado_at: new Date().toISOString() } : {}),
    });
    if (fallo) break;
  }
}

const RANGO: Record<EstadoEntrega["estado"], number> = { sent: 1, delivered: 2, read: 3, failed: 4 };

/**
 * Delivery receipts for what we sent. They can arrive out of order (read
 * before delivered), so a status only replaces a lower one; failed wins.
 */
export async function guardarEstados(estados: EstadoEntrega[]): Promise<void> {
  if (!estados.length) return;
  const ids = [...new Set(estados.map((e) => e.messageId))];
  const { data, error } = await db().from("whatsapp_mensajes").select("id, wa_message_id, estado").in("wa_message_id", ids);
  if (error) {
    console.error("[whatsapp] estados:", error);
    return;
  }
  for (const fila of (data ?? []) as { id: string; wa_message_id: string; estado: EstadoEntrega["estado"] | null }[]) {
    const nuevo = estados
      .filter((e) => e.messageId === fila.wa_message_id)
      .sort((a, b) => RANGO[b.estado] - RANGO[a.estado])[0];
    if (!nuevo || (fila.estado && RANGO[fila.estado] >= RANGO[nuevo.estado])) continue;
    await db()
      .from("whatsapp_mensajes")
      .update({ estado: nuevo.estado, error: nuevo.error, estado_at: (nuevo.at ?? new Date()).toISOString() })
      .eq("id", fila.id);
  }
}

/** Same nudge the stations send each other (app/pos/pos-live.ts), so the order shows at once. */
async function avisarPos(organizationId: string): Promise<void> {
  try {
    await db().channel(`pos:${organizationId}`).httpSend("ordenes", {});
  } catch (e) {
    console.warn("[whatsapp] aviso POS:", e);
  }
}
