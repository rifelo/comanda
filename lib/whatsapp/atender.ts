import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPosCatalog } from "@/lib/pos/catalog";
import { syncOrderConsumption } from "@/lib/pos/stock";
import { responderWhatsapp, type Turno } from "@/lib/ai/whatsapp-agent";
import { enviarTexto, marcarLeidoEscribiendo, type Eco, type Entrante } from "./cloud-api";
import { guardarPedidoWhatsapp, validarPedido } from "./pedido";

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
  agente_activo: boolean;
};

const db = () => createSupabaseAdminClient();

async function numero(phoneNumberId: string): Promise<Numero | null> {
  const { data, error } = await db()
    .from("whatsapp_numeros")
    .select("phone_number_id, organization_id, restaurant_id, direccion, horario, domicilios, agente_activo")
    .eq("phone_number_id", phoneNumberId)
    .maybeSingle();
  if (error) console.error("[whatsapp] numero:", error);
  return (data as Numero | null) ?? null;
}

async function conversacion(n: Numero, waId: string, nombre: string | null, entrante: Date | null): Promise<string | null> {
  const { data, error } = await db()
    .from("whatsapp_conversaciones")
    .upsert(
      {
        organization_id: n.organization_id,
        phone_number_id: n.phone_number_id,
        wa_id: waId,
        ...(nombre ? { nombre } : {}),
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
    const convId = await conversacion(n, e.waId, e.nombre, e.at);
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

const ahoraYopal = () =>
  new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "full", timeStyle: "short" }).format(new Date());

export async function responder(p: Pendiente): Promise<void> {
  await marcarLeidoEscribiendo(p.phoneNumberId, p.messageId);
  await new Promise((r) => setTimeout(r, ESPERA_RAFAGA_MS));

  const n = await numero(p.phoneNumberId);
  if (!n?.agente_activo) return;
  const { data: conv } = await db()
    .from("whatsapp_conversaciones")
    .select("agente_pausado_hasta")
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

  let ordenId: string | null = null;
  const res = await responderWhatsapp({
    catalog,
    local: {
      nombre: orgName,
      direccion: n.direccion,
      horario: n.horario,
      domicilios: n.domicilios,
      instagram: ((org?.instagram as string | null) ?? "").replace(/^@/, "") || null,
    },
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
      pasarAHumano: async (motivo) => {
        console.info("[whatsapp] a humano:", p.waId, motivo);
        await db()
          .from("whatsapp_conversaciones")
          .update({ agente_pausado_hasta: new Date(Date.now() + PAUSA_HUMANO_MS).toISOString() })
          .eq("id", p.conversacionId);
      },
    },
  });
  if (!res.texto) return;
  const waId = await enviarTexto(p.phoneNumberId, p.waId, res.texto);
  await guardarMensaje({
    organization_id: n.organization_id,
    conversacion_id: p.conversacionId,
    wa_message_id: waId,
    autor: "agente",
    texto: res.texto,
    orden_id: ordenId,
  });
}

/** Same nudge the stations send each other (app/pos/pos-live.ts), so the order shows at once. */
async function avisarPos(organizationId: string): Promise<void> {
  try {
    await db().channel(`pos:${organizationId}`).httpSend("ordenes", {});
  } catch (e) {
    console.warn("[whatsapp] aviso POS:", e);
  }
}
