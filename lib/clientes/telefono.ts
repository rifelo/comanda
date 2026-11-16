import { createHmac, timingSafeEqual } from "node:crypto";
import type { Premio } from "./premios";

// The WhatsApp number of a Mi Pa'Yo customer (0095): how it is linked to an
// @ and what the WhatsApp agent gets to read about it. Pure and tested; the
// reads and writes live in mi-payo-whatsapp.ts.

// ---------------------------------------------------------------------------
// The number
// ---------------------------------------------------------------------------

/**
 * Digits only, E.164 without «+» — the shape of ordenes.customer_phone and
 * whatsapp_clientes.wa_id. A bare Colombian mobile (10 digits starting with
 * 3) gets its 57. Anything else that isn't 8–15 digits is not a phone (a
 * WhatsApp BSUID, a typo) → null.
 */
export function normalizarTelefono(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  const tel = d.length === 10 && d.startsWith("3") ? `57${d}` : d;
  return /^\d{8,15}$/.test(tel) ? tel : null;
}

/** «… 5222» — enough for the customer to recognise their number, never the whole of it. */
export const finDeTelefono = (tel: string) => `… ${tel.slice(-4)}`;

// ---------------------------------------------------------------------------
// The decision
// ---------------------------------------------------------------------------

export type OrigenVinculo = "qr" | "enlace";

export type DecisionVinculo =
  | { accion: "vincular" }
  /** The @ already has this very number: nothing to write. */
  | { accion: "ya" }
  /** The @ has another number and this origin may not replace it. */
  | { accion: "omitir"; motivo: "otro_telefono" }
  /** The number belongs to another @: never stolen. */
  | { accion: "omitir"; motivo: "telefono_de_otro" };

/**
 * Whether `telefono` may be written on a customer.
 * - `telefonoActual`: the number the @ already has (null = none).
 * - `duenoDelTelefono`: id of the customer that already holds the number (null = nobody).
 * - `reemplazar`: the @ may swap its number for this one. Only a phone that
 *   proved the @ (it scanned one of its cups: the `pym_v` cookie) passes it;
 *   a QR scan or a typed @ never replaces a number.
 */
export function decidirVinculo(input: {
  clienteId: string;
  telefono: string;
  telefonoActual: string | null;
  duenoDelTelefono: string | null;
  reemplazar?: boolean;
}): DecisionVinculo {
  if (input.duenoDelTelefono && input.duenoDelTelefono !== input.clienteId) return { accion: "omitir", motivo: "telefono_de_otro" };
  if (input.telefonoActual === input.telefono) return { accion: "ya" };
  if (input.telefonoActual && !input.reemplazar) return { accion: "omitir", motivo: "otro_telefono" };
  return { accion: "vincular" };
}

// ---------------------------------------------------------------------------
// The signed link the agent sends
// ---------------------------------------------------------------------------

/** Where the link opens: Mi Pa'Yo on the café's domain (the proxy lets /menu/* through). */
export const URL_VINCULAR = "https://cafepayo.com/menu/puntos/vincular";

/** How long a link is good for. */
export const VIGENCIA_VINCULAR_MS = 24 * 3600_000;

/** Same secret as the reward codes and the verified cookie (premios-codigo.ts). */
function secreto(): string {
  const s = process.env.BETTER_AUTH_SECRET || process.env.CRON_SECRET;
  if (!s) throw new Error("Falta BETTER_AUTH_SECRET para firmar el enlace de vincular WhatsApp.");
  return s;
}

const firma = (cuerpo: string) => createHmac("sha256", secreto()).update(`vincular:${cuerpo}`).digest("base64url");

export interface TokenVincular {
  orgId: string;
  telefono: string;
  /** Epoch ms after which the link no longer works. */
  expira: number;
}

/** `<org>.<phone>.<expiry in s, base 36>.<hmac>` — all URL-safe. */
export function firmarTokenVincular(orgId: string, telefono: string, ahora: number = Date.now()): string {
  const tel = normalizarTelefono(telefono);
  if (!tel) throw new Error(`Teléfono inválido para vincular: ${telefono}`);
  const exp = Math.floor((ahora + VIGENCIA_VINCULAR_MS) / 1000).toString(36);
  const cuerpo = `${orgId}.${tel}.${exp}`;
  return `${cuerpo}.${firma(cuerpo)}`;
}

export type LecturaToken = { ok: true; token: TokenVincular } | { ok: false; motivo: "invalido" | "vencido" };

export function leerTokenVincular(token: string | null | undefined, ahora: number = Date.now()): LecturaToken {
  const partes = (token ?? "").trim().split(".");
  if (partes.length !== 4) return { ok: false, motivo: "invalido" };
  const [orgId, tel, exp, sig] = partes;
  const cuerpo = `${orgId}.${tel}.${exp}`;
  const esperada = Buffer.from(firma(cuerpo));
  const dada = Buffer.from(sig);
  if (esperada.length !== dada.length || !timingSafeEqual(esperada, dada)) return { ok: false, motivo: "invalido" };
  const telefono = normalizarTelefono(tel);
  const expira = parseInt(exp, 36) * 1000;
  if (!telefono || telefono !== tel || !/^[0-9a-f-]{36}$/i.test(orgId) || !Number.isFinite(expira)) return { ok: false, motivo: "invalido" };
  if (ahora > expira) return { ok: false, motivo: "vencido" };
  return { ok: true, token: { orgId, telefono, expira } };
}

/** What the link page says when the token does not hold. */
export const mensajeTokenVincular = (motivo: "invalido" | "vencido") =>
  motivo === "vencido"
    ? "Este enlace ya venció (dura 24 horas). Escríbenos por WhatsApp y te mandamos uno nuevo."
    : "Este enlace no es válido. Pídenos uno nuevo por WhatsApp.";

/**
 * The link the WhatsApp agent sends a customer whose number is not linked
 * yet: it opens Mi Pa'Yo, which links this number to their @ in one tap.
 * Good for 24 h.
 */
export function enlaceVincular(orgId: string, telefono: string, ahora: number = Date.now()): string {
  return `${URL_VINCULAR}?t=${encodeURIComponent(firmarTokenVincular(orgId, telefono, ahora))}`;
}

// ---------------------------------------------------------------------------
// What the agent reads
// ---------------------------------------------------------------------------

export interface ResumenMiPayo {
  instagram: string;
  puntos: number;
  /** The next reward the balance does not reach yet (null = it reaches all). */
  siguiente: { titulo: string; puntos: number; faltan: number } | null;
  /** Rewards the balance already pays for, cheapest first. */
  canjeables: { titulo: string; puntos: number; detalle: string }[];
  /** Last five paid cups, newest first: what it was and the Bogotá day. */
  ultimas: { nombre: string; cuando: string }[];
  /** Drinks (not food) counted over the whole history. */
  totalBebidas: number;
  /** Days in a row with a drink up to today (0 = none). */
  racha: number;
}

export const premioCorto = (p: Premio) => ({ titulo: p.titulo, puntos: p.puntos, detalle: p.detalle });

/** A short Spanish block (≤ 8 lines) for the agent's prompt. */
export function textoMiPayoParaAgente(r: ResumenMiPayo | null): string {
  if (!r) return "Mi Pa'Yo: este WhatsApp no está vinculado a ningún @ de Instagram. Si pregunta por sus puntos, mándale el enlace para vincularlo.";
  const lineas = [`Mi Pa'Yo de @${r.instagram}: ${r.puntos} ${r.puntos === 1 ? "punto" : "puntos"}.`];
  if (r.canjeables.length) lineas.push(`Ya puede canjear: ${r.canjeables.map((p) => `«${p.titulo}» (${p.puntos} pts: ${p.detalle})`).join("; ")}. Se canjea en la caja, con el código que le muestra cafepayo.com/puntos.`);
  if (r.siguiente) lineas.push(`Le faltan ${r.siguiente.faltan} para «${r.siguiente.titulo}» (${r.siguiente.puntos} pts).`);
  lineas.push(`Bebidas con puntos: ${r.totalBebidas}${r.racha > 0 ? `; racha de ${r.racha} ${r.racha === 1 ? "día" : "días"} seguidos` : ""}.`);
  if (r.ultimas.length) lineas.push(`Últimas: ${r.ultimas.map((u) => `${u.nombre} (${u.cuando})`).join(", ")}.`);
  return lineas.join("\n");
}
