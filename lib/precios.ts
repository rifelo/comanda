/**
 * Pure helpers for the Listas de precios module. No I/O — unit-tested in
 * precios.test.ts; the DB fetch lives in lib/db/precios.ts.
 */

/** The price a list charges for a producto: its override, or the base price. */
export function effectivePrice(base: number, override: number | null): number {
  return override ?? base;
}

/**
 * Percent difference of a list price vs the base price:
 * round((price - base) / base * 100). 0 when base is 0.
 */
export function priceDeltaPct(base: number, price: number): number {
  if (base <= 0) return 0;
  return Math.round(((price - base) / base) * 100);
}
