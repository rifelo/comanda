import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * WhatsApp Cloud API (Meta) — the thin layer the sales agent talks through:
 * checking that a webhook really comes from Meta, reading what it carries, and
 * sending replies. No Supabase or Claude in here, so the parsing is unit-tested.
 *
 * Env: WHATSAPP_TOKEN (system-user access token), WHATSAPP_APP_SECRET (signs
 * the webhooks), WHATSAPP_VERIFY_TOKEN (any string, typed in the Meta app when
 * the webhook URL is registered), WHATSAPP_GRAPH_VERSION (optional).
 */
const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || "v23.0";

/** `X-Hub-Signature-256: sha256=<hex>` is an HMAC of the raw body with the app secret. */
export function isValidSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=") || !appSecret) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  const got = Buffer.from(header.slice("sha256=".length), "hex");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** Something a customer wrote to the business. */
export interface Entrante {
  phoneNumberId: string;
  /** Customer's number, E.164 without «+». */
  waId: string;
  nombre: string | null;
  messageId: string;
  /** Text, or null when it was a sticker, audio, location… */
  texto: string | null;
  tipo: string;
  at: Date;
}

/** Something the team wrote from the WhatsApp Business app (coexistence echo). */
export interface Eco {
  phoneNumberId: string;
  waId: string;
  messageId: string;
  texto: string | null;
  at: Date;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const when = (ts: unknown): Date => {
  const n = Number(ts);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : new Date();
};

/** Text of a message of any type that carries some (text, button reply, list reply, caption). */
function textoDe(m: Obj): string | null {
  const t = str(m.type);
  if (t === "text") return str(obj(m.text).body);
  if (t === "button") return str(obj(m.button).text);
  if (t === "interactive") {
    const i = obj(m.interactive);
    return str(obj(i.button_reply).title) ?? str(obj(i.list_reply).title);
  }
  if (t === "image" || t === "video" || t === "document") return str(obj(m[t]).caption);
  return null;
}

/** Customer messages and team echoes in one webhook (statuses and the rest are ignored). */
export function leerWebhook(body: unknown): { entrantes: Entrante[]; ecos: Eco[] } {
  const entrantes: Entrante[] = [];
  const ecos: Eco[] = [];
  for (const entry of arr(obj(body).entry)) {
    for (const change of arr(obj(entry).changes)) {
      const c = obj(change);
      const value = obj(c.value);
      const phoneNumberId = str(obj(value.metadata).phone_number_id);
      if (!phoneNumberId) continue;
      if (c.field === "messages") {
        const nombres = new Map<string, string>();
        for (const ct of arr(value.contacts)) {
          const waId = str(obj(ct).wa_id);
          const name = str(obj(obj(ct).profile).name);
          if (waId && name) nombres.set(waId, name);
        }
        for (const raw of arr(value.messages)) {
          const m = obj(raw);
          const waId = str(m.from);
          const messageId = str(m.id);
          if (!waId || !messageId) continue;
          entrantes.push({
            phoneNumberId,
            waId,
            nombre: nombres.get(waId) ?? null,
            messageId,
            texto: textoDe(m),
            tipo: str(m.type) ?? "unknown",
            at: when(m.timestamp),
          });
        }
      } else if (c.field === "smb_message_echoes") {
        for (const raw of arr(value.message_echoes)) {
          const m = obj(raw);
          const waId = str(m.to);
          const messageId = str(m.id);
          if (!waId || !messageId) continue;
          ecos.push({ phoneNumberId, waId, messageId, texto: textoDe(m), at: when(m.timestamp) });
        }
      }
    }
  }
  return { entrantes, ecos };
}

async function graph(phoneNumberId: string, payload: object): Promise<Obj> {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) throw new Error("Falta WHATSAPP_TOKEN en el entorno.");
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
  });
  const json = obj(await res.json().catch(() => ({})));
  if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${JSON.stringify(json.error ?? json).slice(0, 300)}`);
  return json;
}

/** Send a text reply; returns Meta's message id. */
export async function enviarTexto(phoneNumberId: string, to: string, body: string): Promise<string | null> {
  const json = await graph(phoneNumberId, { recipient_type: "individual", to, type: "text", text: { body, preview_url: true } });
  return str(obj(arr(json.messages)[0]).id);
}

/** Blue ticks plus «escribiendo…» while the agent thinks. Never throws. */
export async function marcarLeidoEscribiendo(phoneNumberId: string, messageId: string): Promise<void> {
  try {
    await graph(phoneNumberId, { status: "read", message_id: messageId, typing_indicator: { type: "text" } });
  } catch (e) {
    console.warn("[whatsapp] read/typing:", e);
  }
}
