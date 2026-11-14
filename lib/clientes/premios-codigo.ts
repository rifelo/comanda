import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// The 4-digit code a customer shows at the register to redeem a reward.
// Mi Pa'Yo only shows it on a phone that scanned one of that @'s cups (see
// sesion.ts), and it changes every 10 minutes; the register accepts the
// current window and the one before.

const VENTANA_MS = 10 * 60_000;

function secreto(): string {
  const s = process.env.BETTER_AUTH_SECRET || process.env.CRON_SECRET;
  if (!s) throw new Error("Falta BETTER_AUTH_SECRET para firmar los códigos de premios.");
  return s;
}

export function firmar(texto: string): string {
  return createHmac("sha256", secreto()).update(texto).digest("base64url");
}

const ventanaDe = (t: number) => Math.floor(t / VENTANA_MS);

function codigoDe(clienteId: string, ventana: number): string {
  const h = createHmac("sha256", secreto()).update(`canje:${clienteId}:${ventana}`).digest();
  return String(h.readUInt32BE(0) % 10_000).padStart(4, "0");
}

/** The code to show now, and until when it is good (ISO). */
export function codigoCanje(clienteId: string, ahora: number = Date.now()): { codigo: string; hasta: string } {
  const v = ventanaDe(ahora);
  return { codigo: codigoDe(clienteId, v), hasta: new Date((v + 1) * VENTANA_MS + VENTANA_MS).toISOString() };
}

export function codigoValido(clienteId: string, codigo: string, ahora: number = Date.now()): boolean {
  const c = codigo.replace(/\D/g, "");
  if (c.length !== 4) return false;
  const v = ventanaDe(ahora);
  return [v, v - 1].some((w) => timingSafeEqual(Buffer.from(codigoDe(clienteId, w)), Buffer.from(c)));
}
