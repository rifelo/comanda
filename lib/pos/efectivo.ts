/**
 * Cash amounts for the register (pure, tested in efectivo.test.ts).
 *
 * `sugerenciasEfectivo` gives the amounts a customer is most likely to hand
 * over for a total — the next round figure for each bill — so the ticket can
 * charge cash with one tap («$ 30.000») instead of opening the keypad.
 */

/** What the cash keypad adds with one tap: the coins and bills that move in the shop. */
export const SUMAS_EFECTIVO = [500, 1_000, 2_000, 5_000, 10_000, 20_000, 50_000, 100_000] as const;

const REDONDEOS = [2_000, 5_000, 10_000, 20_000, 50_000, 100_000];

/** Up to `max` amounts above `total`, smallest first: 26.000 → 30.000, 40.000. */
export function sugerenciasEfectivo(total: number, max = 2): number[] {
  if (!(total > 0)) return [];
  const out = new Set<number>();
  for (const b of REDONDEOS) {
    const n = Math.ceil(total / b) * b;
    if (n > total) out.add(n);
  }
  return [...out].sort((a, b) => a - b).slice(0, max);
}
