import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * WhatsApp Cloud API (Meta) — the thin layer the sales agent talks through:
 * checking that a webhook really comes from Meta, reading what it carries, and
 * sending replies. No Supabase or Claude in here, so the parsing is unit-tested.
 *
 * Two ways in, same payloads (360dialog forwards Meta's webhooks as they are):
 *   · 360dialog (BSP): D360_API_KEY. It doesn't sign webhooks, so the URL is
 *     registered with an `Authorization: Bearer <WHATSAPP_WEBHOOK_SECRET>`
 *     header (POST /v1/configs/webhook) and checked here.
 *   · Meta directly: WHATSAPP_TOKEN (system-user token), WHATSAPP_APP_SECRET
 *     (signs the webhooks), WHATSAPP_VERIFY_TOKEN, WHATSAPP_GRAPH_VERSION.
 */
const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || "v23.0";
const D360_URL = "https://waba-v2.360dialog.io/messages";

/** `X-Hub-Signature-256: sha256=<hex>` is an HMAC of the raw body with the app secret. */
export function isValidSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=") || !appSecret) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  const got = Buffer.from(header.slice("sha256=".length), "hex");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** `Authorization: Bearer <secret>` — the header the webhook was registered with at 360dialog. */
export function isValidBearer(header: string | null, secret: string): boolean {
  if (!header?.startsWith("Bearer ") || secret.length < 16) return false;
  const got = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** A webhook comes from 360dialog (our secret header) or from Meta (its signature). */
export function isAuthorizedWebhook(rawBody: string, headers: { get(name: string): string | null }): boolean {
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET ?? "";
  if (secret && isValidBearer(headers.get("authorization"), secret)) return true;
  const appSecret = process.env.WHATSAPP_APP_SECRET ?? "";
  return Boolean(appSecret) && isValidSignature(rawBody, headers.get("x-hub-signature-256"), appSecret);
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

/** POST to the messages endpoint of whichever provider is configured. */
async function graph(phoneNumberId: string, payload: object): Promise<Obj> {
  const d360 = process.env.D360_API_KEY;
  const token = process.env.WHATSAPP_TOKEN;
  if (!d360 && !token) throw new Error("Falta D360_API_KEY (o WHATSAPP_TOKEN) en el entorno.");
  // A 360dialog key belongs to one number, so its URL carries no phone number id.
  const url = d360 ? D360_URL : `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;
  const auth: Record<string, string> = d360 ? { "D360-API-KEY": d360 } : { Authorization: `Bearer ${token}` };
  const res = await fetch(url, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
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
