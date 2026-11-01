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
  /** Order the line belongs to (pairs are counted per order). */
  ordenId?: string;
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

export const PAIRS_MAX = 4;
/** A pair seen on fewer orders than this is noise, not a habit. */
export const PAIRS_MIN_ORDERS = 3;

/**
 * «Lo que más piden con esto»: for each product, the other products that
 * show up on the same orders, most frequent first, with the share of the
 * product's orders that had them. Feeds «Recomiéndale» on the options page.
 */
export function rankPairs(
  lines: SoldLine[],
  names: Map<string, string>,
  max = PAIRS_MAX,
): Record<string, { id: string; pct: number }[]> {
  const byOrder = new Map<string, Set<string>>();
  for (const l of lines) {
    if (!l.ordenId || !l.productoId || !names.has(l.productoId) || !(l.qty > 0)) continue;
    let set = byOrder.get(l.ordenId);
    if (!set) byOrder.set(l.ordenId, (set = new Set()));
    set.add(l.productoId);
  }
  const orders = new Map<string, number>();
  const together = new Map<string, Map<string, number>>();
  for (const set of byOrder.values()) {
    for (const a of set) {
      orders.set(a, (orders.get(a) ?? 0) + 1);
      for (const b of set) {
        if (a === b) continue;
        let m = together.get(a);
        if (!m) together.set(a, (m = new Map()));
        m.set(b, (m.get(b) ?? 0) + 1);
      }
    }
  }
  const out: Record<string, { id: string; pct: number }[]> = {};
  for (const [a, m] of together) {
    const total = orders.get(a) ?? 0;
    const ranked = [...m.entries()]
      .filter(([, n]) => n >= PAIRS_MIN_ORDERS)
      .sort((x, y) => y[1] - x[1] || names.get(x[0])!.localeCompare(names.get(y[0])!, "es"))
      .slice(0, max)
      .map(([id, n]) => ({ id, pct: Math.round((n / total) * 100) }));
    if (ranked.length) out[a] = ranked;
  }
  return out;
}
