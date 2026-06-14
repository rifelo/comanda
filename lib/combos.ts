/**
 * Pure combo pricing helpers. A combo's "regular" total is the sum of its
 * items at list price; the saving is how much cheaper the bundle is.
 * No I/O — unit-tested in combos.test.ts.
 */

export function comboRegularTotal(
  items: ReadonlyArray<{ qty: number; price_cop: number }>,
): number {
  return items.reduce((sum, it) => sum + it.qty * it.price_cop, 0);
}

/** Bundle saving = regular total − combo price, never negative. */
export function comboSaving(regularTotal: number, comboPrice: number): number {
  return Math.max(0, regularTotal - comboPrice);
}

/** Saving as a whole-percent of the regular total (0 when nothing to save). */
export function comboSavingPct(regularTotal: number, comboPrice: number): number {
  if (regularTotal <= 0) return 0;
  return Math.round((comboSaving(regularTotal, comboPrice) / regularTotal) * 100);
}
