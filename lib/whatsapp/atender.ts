import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPosCatalog } from "@/lib/pos/catalog";
import { syncOrderConsumption } from "@/lib/pos/stock";
import { datosDelDia, enBurbujas, fichaParaAgente, menuParaAgente, redactarAviso, responderWhatsapp, type CambiosFicha, type FichaCliente, type Respuesta, type Turno } from "@/lib/ai/whatsapp-agent";
import { responderConConsola } from "@/lib/ai/whatsapp-consola";
import { enlaceVincular, resumenMiPayoPorTelefono, textoMiPayoParaAgente } from "@/lib/clientes/mi-payo-whatsapp";
import { enviarReaccion, enviarTexto, marcarLeidoEscribiendo, type Eco, type Entrante, type EstadoEntrega } from "./cloud-api";
import { guardarPedidoWhatsapp, validarPedido } from "./pedido";
import { atiendeA, usaConsola } from "./probadores";
import { ESPERA_LIMITE_MS, esLimitePorNumero, nuevoDesdeRespuesta, sesionVigente, ultimaSesion } from "./sesion";
import { versionPrompt, type Leccion } from "./aprendizajes";
import { enlazarClaves, esTelefono, habitosDePedidos, telefonoDe, usuario, type ClavesCliente, type FilaClaves } from "./ficha";

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
/** Chat the agent re-reads; older context lives in the client file instead. */
const HISTORIAL_HORAS = 8;
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
  prompt_version?: string;
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
const pausaEscribiendo = (texto: string) => Math.min(5_000, 1_500 + texto.length * 30);
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

const CAMPOS_FICHA = "id, wa_id, user_id, username, trato, habitual, entrega, pago, preferencias, notas";
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
async function cargarFicha(
  orgId: string,
  c: ClavesCliente,
  perfil: string | null,
  grupos: Record<string, { name: string }>,
): Promise<{ ficha: FichaCliente; filaId: string | null }> {
  const f = await buscarFicha(orgId, c);
  const tel = telefonoDe(c, f);
  const { data: ords } = tel
    ? await db()
        .from("ordenes")
        .select("folio, status, wa_estado, created_at, order_type, delivery_address, orden_items(name, qty, mods)")
        .eq("organization_id", orgId)
        .eq("customer_phone", tel)
        .neq("status", "cancelada")
        .order("created_at", { ascending: false })
        .limit(10)
    : { data: [] };
  type Orden = {
    folio: string;
    status: string;
    wa_estado: string | null;
    created_at: string;
    order_type: string;
    delivery_address: string | null;
    orden_items: { name: string; qty: number; mods: Record<string, string | string[]> | null }[];
  };
  const ordenes = (ords ?? []) as Orden[];
  // Last 10 orders feed the repeated choices; only the last 3 are listed.
  const habitos = habitosDePedidos(
    ordenes.flatMap((o) => (o.orden_items ?? []).map((i) => i.mods ?? {})),
    grupos,
  );
  const pedidos = ordenes.slice(0, 3).map((o) => {
    const dia = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(o.created_at));
    const items = (o.orden_items ?? []).map((i) => `${i.qty} ${i.name}`).join(", ");
    const estado = o.wa_estado === "por_aceptar" ? "esperando confirmación" : o.wa_estado === "rechazado" ? "rechazado (ya se le explicó)" : o.wa_estado === "aceptado" && o.status === "pendiente" ? "en preparación" : o.status;
    return `${o.folio} · ${dia} · ${estado}: ${items}${o.order_type === "domicilio" && o.delivery_address ? ` (a ${o.delivery_address})` : ""}`;
  });
  return {
    filaId: f?.id ?? null,
    ficha: {
      perfil,
      trato: f?.trato ?? null,
      habitual: f?.habitual ?? null,
      entrega: f?.entrega ?? null,
      pago: f?.pago ?? null,
      preferencias: f?.preferencias ?? null,
      notas: f?.notas ?? null,
      habitos,
      pedidos,
    },
  };
}

/** A number on the café's Proveedores list (their WhatsApp). */
async function esProveedor(orgId: string, waId: string): Promise<boolean> {
  if (!esTelefono(waId)) return false;
  const { data, error } = await db()
    .from("proveedores")
    .select("id")
    .eq("organization_id", orgId)
    .eq("whatsapp", waId)
    .eq("archived", false)
    .limit(1);
  if (error) console.warn("[whatsapp] proveedores:", error);
  return !!data?.length;
}

const ahoraYopal = () =>
  new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "full", timeStyle: "short" }).format(new Date());

export async function responder(p: Pendiente): Promise<void> {
  // Checked before the read receipt: a customer the agent won't answer must
  // not see "escribiendo…".
  const antes = await numero(p.phoneNumberId);
  if (!antes || !atiendeA(antes.agente_activo, p.waId)) return;
  // Suppliers write to the same number: those on the Proveedores list are
  // left to the team (no read receipt, no reply).
  if (await esProveedor(antes.organization_id, p.waId)) return;
  await marcarLeidoEscribiendo(p.phoneNumberId, p.messageId);
  await new Promise((r) => setTimeout(r, ESPERA_RAFAGA_MS));

  const n = await numero(p.phoneNumberId);
  if (!n || !atiendeA(n.agente_activo, p.waId)) return;
  const { data: conv } = await db()
    .from("whatsapp_conversaciones")
    .select("agente_pausado_hasta, nombre, username, user_id, agente_sesion_id, agente_sesion_at")
    .eq("id", p.conversacionId)
    .single();
  if (conv?.agente_pausado_hasta && new Date(conv.agente_pausado_hasta as string) > new Date()) return;

  const desde = new Date(Date.now() - HISTORIAL_HORAS * 60 * 60 * 1000).toISOString();
  const { data: filas } = await db()
    .from("whatsapp_mensajes")
    .select("autor, texto, wa_message_id, created_at, prompt_version")
    .eq("conversacion_id", p.conversacionId)
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(HISTORIAL_MAX);
  const turnos = ultimaSesion(
    ((filas ?? []) as { autor: Turno["autor"]; texto: string; wa_message_id: string | null; created_at: string; prompt_version: string | null }[])
      .reverse()
      .map((f) => ({ ...f, at: new Date(f.created_at) })),
  );
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
  const { data: lecc } = await db()
    .from("agente_lecciones")
    .select("id, texto")
    .eq("organization_id", n.organization_id)
    .eq("estado", "aprobada")
    .order("created_at", { ascending: true });
  const lecciones = (lecc ?? []) as Leccion[];
  const version = versionPrompt(lecciones);
  const cargada = await cargarFicha(n.organization_id, claves, (conv?.nombre as string | null) ?? null, catalog.modGroups);
  const ficha = cargada.ficha;
  // Mi Pa'Yo by phone: points and prizes, or the link to tie this WhatsApp to their @.
  if (esTelefono(p.waId)) {
    try {
      const resumen = await resumenMiPayoPorTelefono(db(), n.organization_id, p.waId);
      ficha.mipayo = resumen
        ? textoMiPayoParaAgente(resumen)
        : `${textoMiPayoParaAgente(null)}\nEnlace: ${enlaceVincular(n.organization_id, p.waId)}`;
    } catch (e) {
      console.warn("[whatsapp] mi pa'yo:", e);
    }
  }
  let filaId = cargada.filaId;
  let ordenId: string | null = null;
  const entrada: Parameters<typeof responderWhatsapp>[0] = {
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
    lecciones,
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
          .update({
            agente_pausado_hasta: new Date(Date.now() + PAUSA_HUMANO_MS).toISOString(),
            traspaso_at: new Date().toISOString(),
            traspaso_motivo: motivo.slice(0, 300),
          })
          .eq("id", p.conversacionId);
      },
    },
  };
  const res = usaConsola(p.waId) ? await responderPorConsola(entrada, conv, p, version) : await responderWhatsapp(entrada);
  if (res.reaccion) await enviarReaccion(p.phoneNumberId, p.waId, p.messageId, res.reaccion);
  await enviarBurbujas({
    phoneNumberId: p.phoneNumberId,
    waId: p.waId,
    organizationId: n.organization_id,
    conversacionId: p.conversacionId,
    texto: res.texto,
    ordenId,
    version,
    conReaccion: !!res.reaccion,
  });
}

/**
 * Sends a reply as WhatsApp bubbles and stores each one. WhatsApp lets a
 * business send ~1 message every 6 s to the same person: bubbles go out with
 * a typing-sized pause, and on a 429 we wait and retry once with whatever is
 * left merged into one message, so nothing is lost.
 */
async function enviarBurbujas(a: {
  phoneNumberId: string;
  waId: string;
  organizationId: string;
  conversacionId: string;
  texto: string;
  ordenId: string | null;
  version: string;
  conReaccion?: boolean;
}): Promise<void> {
  const cola = enBurbujas(a.texto);
  if (a.conReaccion && cola.length) await dormir(1_500);
  for (let i = 0; cola.length; i++) {
    const burbuja = cola.shift()!;
    if (i > 0) await dormir(pausaEscribiendo(burbuja));
    let waId: string | null = null;
    let fallo: string | null = null;
    let texto = burbuja;
    try {
      waId = await enviarTexto(a.phoneNumberId, a.waId, texto);
    } catch (e) {
      fallo = (e instanceof Error ? e.message : String(e)).slice(0, 500);
      if (esLimitePorNumero(fallo)) {
        await dormir(ESPERA_LIMITE_MS);
        texto = [burbuja, ...cola.splice(0)].join("\n\n");
        try {
          waId = await enviarTexto(a.phoneNumberId, a.waId, texto);
          fallo = null;
        } catch (e2) {
          fallo = (e2 instanceof Error ? e2.message : String(e2)).slice(0, 500);
        }
      }
      if (fallo) console.error("[whatsapp] envío:", fallo);
    }
    await guardarMensaje({
      organization_id: a.organizationId,
      conversacion_id: a.conversacionId,
      wa_message_id: waId,
      autor: "agente",
      texto,
      orden_id: i === 0 ? a.ordenId : null,
      prompt_version: a.version,
      ...(fallo ? { estado: "failed", error: fallo, estado_at: new Date().toISOString() } : {}),
    });
    if (fallo) break;
  }
}

/**
 * The Claude Console agent: one session per conversation, reused while the
 * chat is active. It keeps its own history, so it gets only what is new; the
 * day's data and the client file go in when a session starts. If the Console
 * fails, the in-app agent answers instead so the customer is never left hanging.
 */
async function responderPorConsola(
  entrada: Parameters<typeof responderWhatsapp>[0],
  conv: { agente_sesion_id?: unknown; agente_sesion_at?: unknown } | null,
  p: Pendiente,
  version: string,
): Promise<Respuesta> {
  const previa = conv?.agente_sesion_at ? new Date(conv.agente_sesion_at as string) : null;
  const sesionId = sesionVigente(previa) ? ((conv?.agente_sesion_id as string | null) ?? null) : null;
  const nuevo = nuevoDesdeRespuesta(entrada.turnos);
  // Order notices sent from the POS went out without the session: tell it.
  const avisos = (entrada.turnos as (Turno & { created_at?: string; prompt_version?: string | null })[]).filter(
    (t) => t.autor === "agente" && t.prompt_version?.endsWith("·aviso") && (!previa || (t.created_at && new Date(t.created_at) > previa)),
  );
  const contextoTurno = [
    `Hora en Yopal: ${entrada.ahora}.`,
    ...(avisos.length ? [`Desde tu última respuesta ya le enviamos al cliente este aviso de su pedido: ${avisos.map((t) => `«${t.texto}»`).join(" ")}`] : []),
    ...(nuevo.equipo.length ? [`Una persona del equipo le escribió al cliente: ${nuevo.equipo.map((t) => `«${t}»`).join(" ")}`] : []),
  ].join("\n");
  try {
    const r = await responderConConsola({
      sesionId,
      contextoInicial: `${datosDelDia(entrada.local, menuParaAgente(entrada.catalog), entrada.lecciones)}\n\n${fichaParaAgente(entrada.ficha)}`,
      contextoTurno,
      textoCliente: nuevo.cliente || entrada.turnos.at(-1)?.texto || "",
      titulo: `WhatsApp · ${entrada.ficha?.trato ?? entrada.ficha?.perfil ?? p.waId} · ${version}`,
      herramientas: entrada.herramientas,
    });
    await db()
      .from("whatsapp_conversaciones")
      .update({ agente_sesion_id: r.sesionId, agente_sesion_at: new Date().toISOString() })
      .eq("id", p.conversacionId);
    return r;
  } catch (e) {
    console.error("[whatsapp consola] falló, responde el agente de la app:", e);
    await db().from("whatsapp_conversaciones").update({ agente_sesion_id: null }).eq("id", p.conversacionId);
    return responderWhatsapp(entrada);
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

/**
 * The team accepted or turned down a WhatsApp order in the POS: the agent
 * tells the customer, as one of the team — «ya está en preparación», or the
 * barista's reason with an apology, a promise to improve and an alternative
 * that is available. Best effort: a failure here never undoes the decision.
 */
export async function avisarDecisionPedido(ordenId: string): Promise<void> {
  const { data: o } = await db()
    .from("ordenes")
    .select("organization_id, folio, customer_phone, customer_name, order_type, delivery_address, wa_estado, wa_motivo, wa_motivo_detalle, orden_items(name, qty)")
    .eq("id", ordenId)
    .maybeSingle();
  if (!o?.customer_phone || (o.wa_estado !== "aceptado" && o.wa_estado !== "rechazado")) return;
  const orgId = o.organization_id as string;
  const { data: c } = await db()
    .from("whatsapp_conversaciones")
    .select("id, phone_number_id, nombre, username, user_id")
    .eq("organization_id", orgId)
    .eq("wa_id", o.customer_phone as string)
    .order("ultimo_entrante_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (!c) return;
  const n = await numero(c.phone_number_id as string);
  if (!n) return;

  const desde = new Date(Date.now() - HISTORIAL_HORAS * 60 * 60 * 1000).toISOString();
  const { data: filas } = await db()
    .from("whatsapp_mensajes")
    .select("autor, texto, created_at")
    .eq("conversacion_id", c.id as string)
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(HISTORIAL_MAX);
  const turnos = ultimaSesion(
    ((filas ?? []) as { autor: Turno["autor"]; texto: string; created_at: string }[]).reverse().map((f) => ({ ...f, at: new Date(f.created_at) })),
  );

  const { data: org } = await db().from("organizations").select("name, instagram").eq("id", orgId).single();
  const orgName = ((org?.name as string | undefined) ?? "").replace(/'s org$/, "") || "el café";
  const catalog = await getPosCatalog({ organizationId: orgId, userId: null, orgName, client: db() });
  const { data: lecc } = await db().from("agente_lecciones").select("id, texto").eq("organization_id", orgId).eq("estado", "aprobada").order("created_at", { ascending: true });
  const lecciones = (lecc ?? []) as Leccion[];
  const { ficha } = await cargarFicha(
    orgId,
    { waId: o.customer_phone as string, userId: (c.user_id as string | null) ?? null, username: (c.username as string | null) ?? null },
    (c.nombre as string | null) ?? null,
    catalog.modGroups,
  );

  const items = ((o.orden_items ?? []) as { name: string; qty: number }[]).map((i) => `${i.qty} ${i.name}`).join(", ");
  const recoge = o.order_type !== "domicilio";
  const nota =
    o.wa_estado === "aceptado"
      ? `Aceptamos el pedido ${o.folio} (${items}; ${recoge ? "lo recoge en el café" : `domicilio a ${o.delivery_address ?? "su dirección"}`}). Escríbele, como parte del equipo, que su pedido YA está en preparación: este mensaje es la confirmación, así que no digas «te confirmamos» ni repitas el resumen. ${recoge ? "Lo tiene listo en unos 10 minutos y paga al recogerlo aquí." : "Apenas esté listo sale para su dirección."} Uno o dos mensajes cortos.`
      : `No podemos preparar el pedido ${o.folio} (${items}). Motivo que dejó el barista: ${o.wa_motivo ?? "otro"}${o.wa_motivo_detalle ? ` — ${o.wa_motivo_detalle}` : ""}. Escríbele, como parte del equipo: discúlpate con calidez, explícale el motivo con tus palabras y sin tecnicismos, dile que vamos a mejorar el servicio, y recomiéndale una alternativa del menú que sí esté disponible y se parezca a lo que pidió (si el motivo es mucha demanda, ofrece prepararlo un poco más tarde). Pregúntale si quiere que se la preparemos. Dos o tres mensajes cortos.`;
  const texto = await redactarAviso({
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
    lecciones,
    turnos,
    ahora: ahoraYopal(),
    nota,
  });
  if (!texto) return;
  await enviarBurbujas({
    phoneNumberId: n.phone_number_id,
    waId: o.customer_phone as string,
    organizationId: orgId,
    conversacionId: c.id as string,
    texto,
    ordenId: null,
    version: `${versionPrompt(lecciones)}·aviso`,
  });
}
