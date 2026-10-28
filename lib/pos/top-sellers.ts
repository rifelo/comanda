/**
 * Más vendidos — the products the register rings up most, so the Favoritos
 * tab can open on them instead of making the cashier hunt through categories.
 *
 * Counts units of plain items only: a combo line is found under Combos, and
 * its components were not tapped one by one. Ties go to the product sold most
 * recently, then by name, so the grid doesn't reshuffle between loads.
 */
export const TOP_SELLERS_DAYS = 30;
export const TOP_SELLERS_MAX = 12;

export interface SoldLine {
  productoId: string | null;
  qty: number;
  /** ISO timestamp of the order the line belongs to. */
  at: string;
}

export function rankTopSellers(
  lines: SoldLine[],
  /** Products still in the catalog (id → name); anything else is dropped. */
  names: Map<string, string>,
  max = TOP_SELLERS_MAX,
): string[] {
  const units = new Map<string, number>();
  const last = new Map<string, string>();
  for (const l of lines) {
    if (!l.productoId || !names.has(l.productoId) || !(l.qty > 0)) continue;
    units.set(l.productoId, (units.get(l.productoId) ?? 0) + l.qty);
    if ((last.get(l.productoId) ?? "") < l.at) last.set(l.productoId, l.at);
  }
  return [...units.keys()]
    .sort(
      (a, b) =>
        units.get(b)! - units.get(a)! ||
        (last.get(b) ?? "").localeCompare(last.get(a) ?? "") ||
        names.get(a)!.localeCompare(names.get(b)!, "es"),
    )
    .slice(0, max);
}
