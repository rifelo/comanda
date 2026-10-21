/**
 * Period parsing for the kardex and the movimientos log (pure, tested in
 * kardex-periodo.test.ts). Days are Bogotá calendar days (UTC-5, no DST);
 * the range is [desde 00:00, hasta 24:00) expressed as ISO timestamps.
 */

export const DIAS_KARDEX = [7, 30, 90] as const;
export type DiasKardex = (typeof DIAS_KARDEX)[number];

export interface Periodo {
  /** First day, YYYY-MM-DD. */
  desde: string;
  /** Last day (inclusive), YYYY-MM-DD. */
  hasta: string;
  /** The preset that produced it, when one did. */
  dias: DiasKardex | null;
  /** ISO bounds for the query: [desdeIso, hastaIso). */
  desdeIso: string;
  hastaIso: string;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Resolve `?dias=30` or `?desde=…&hasta=…` into a period. Explicit dates win
 * when both are valid and in order; otherwise the preset (default 30 days
 * ending today). `today` is a Bogotá day (YYYY-MM-DD).
 */
export function parsePeriodo(sp: { dias?: string; desde?: string; hasta?: string }, today: string): Periodo {
  const okDesde = sp.desde && DAY_RE.test(sp.desde) ? sp.desde : null;
  const okHasta = sp.hasta && DAY_RE.test(sp.hasta) ? sp.hasta : null;
  let desde: string, hasta: string, dias: DiasKardex | null = null;
  if (okDesde && okHasta && okDesde <= okHasta) {
    desde = okDesde;
    hasta = okHasta;
  } else {
    const n = DIAS_KARDEX.find((d) => String(d) === sp.dias) ?? 30;
    dias = n;
    hasta = today;
    desde = addDays(today, -(n - 1));
  }
  return { desde, hasta, dias, desdeIso: `${desde}T00:00:00-05:00`, hastaIso: `${addDays(hasta, 1)}T00:00:00-05:00` };
}

/** "21 oct" / "21 oct 2025" style label for a YYYY-MM-DD day, deterministic (no Intl). */
export function diaCorto(day: string, withYear = false): string {
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const [y, m, d] = day.split("-").map(Number);
  return `${d} ${MESES[m - 1]}${withYear ? ` ${y}` : ""}`;
}
