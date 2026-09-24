/**
 * Pure helpers for the end-of-shift cash close (no I/O; unit-tested in
 * arqueo.test.ts): the COP denominations the team counts, the totals the
 * owner reviews, and the sales window the expected cash is computed over.
 */

export const DENOMINACIONES_COP = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50] as const;

export interface Denominacion {
  valor: number;
  cantidad: number;
}

/** "12" → 12; "", "1,5", "-1" → null. Whole bills and coins only. */
export function parseCantidad(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : null;
}

export function totalContado(lines: ReadonlyArray<Denominacion>): number {
  return lines.reduce((sum, l) => sum + l.valor * l.cantidad, 0);
}

/** What should be in the drawer: the float it opened with plus cash sales. */
export function esperadoCaja(baseInicial: number, efectivoVentas: number): number {
  return baseInicial + efectivoVentas;
}

/** Negative = money missing, positive = money over. */
export function diferenciaCaja(contado: number, esperado: number): number {
  return contado - esperado;
}

/** What leaves the drawer once tomorrow's float stays behind (negative when
 *  the count cannot even cover the float — the UI flags it). */
export function entregaCaja(contado: number, baseDejada: number): number {
  return contado - baseDejada;
}

export type MetodoPago = "efectivo" | "tarjeta" | "transferencia";

export interface ResumenPagos {
  efectivo: number;
  tarjeta: number;
  transferencia: number;
  count: number;
}

export function resumenPagos(pagos: ReadonlyArray<{ method: MetodoPago | string; amount_cop: number }>): ResumenPagos {
  const out: ResumenPagos = { efectivo: 0, tarjeta: 0, transferencia: 0, count: 0 };
  for (const p of pagos) {
    const amount = Number(p.amount_cop) || 0;
    if (p.method === "efectivo") out.efectivo += amount;
    else if (p.method === "tarjeta") out.tarjeta += amount;
    else if (p.method === "transferencia") out.transferencia += amount;
    else continue;
    out.count += 1;
  }
  return out;
}

/** Offset (minutes east of UTC) of `tz` at the instant `at`. */
function tzOffsetMinutes(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** The instant a wall-clock `HH:MM` on `YYYY-MM-DD` happens in `tz`. */
export function localToUtc(dateYmd: string, hhmm: string, tz: string): Date {
  const [y, m, d] = dateYmd.split("-").map(Number);
  const [h, min] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, min);
  // Two passes cover a DST edge (Bogotá has none, but the sede tz is data).
  let utc = guess - tzOffsetMinutes(tz, new Date(guess)) * 60_000;
  utc = guess - tzOffsetMinutes(tz, new Date(utc)) * 60_000;
  return new Date(utc);
}

export interface VentanaInput {
  /** shift_instances.date (a wall-clock day in `tz`). */
  date: string;
  /** checklist_templates.inicio, "HH:MM" or "HH:MM:SS". */
  inicio: string;
  tz: string;
  opened_at: string | null;
  closed_at: string | null;
  now?: Date;
}

/**
 * The sales window a cash close is compared against: from the moment the
 * turno actually opened (or its scheduled start when nobody ticked anything)
 * until it closed (or right now while still open). Never inverted.
 */
export function ventanaTurno(input: VentanaInput): { desde: string; hasta: string } {
  const now = input.now ?? new Date();
  const hasta = input.closed_at ? new Date(input.closed_at) : now;
  let desde = input.opened_at ? new Date(input.opened_at) : localToUtc(input.date, input.inicio.slice(0, 5), input.tz);
  if (desde > hasta) desde = hasta;
  return { desde: desde.toISOString(), hasta: hasta.toISOString() };
}
