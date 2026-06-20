/**
 * Pure costing / stock helpers shared across the Productos modules
 * (recetas, notificaciones, movimientos). No I/O — unit-tested in cost.test.ts.
 */

/** Cost of one recipe line: quantity × unit cost, rounded to whole COP. */
export function lineTotal(qty: number, costPerUnit: number): number {
  return Math.round(qty * costPerUnit);
}

/**
 * Per-unit cost derived from a pack purchase: what you paid for the pack
 * divided by how many units it holds, rounded to whole COP. Returns 0 when
 * the pack quantity isn't positive (avoids divide-by-zero). Mirrors the
 * `cost_cop = round(pack_cost_cop / pack_qty)` rule the inventario action
 * applies when an ingrediente is bought by pack.
 * Example: unitCostFromPack(4400, 12) === 367.
 */
export function unitCostFromPack(packCost: number, packQty: number): number {
  return packQty > 0 ? Math.round(packCost / packQty) : 0;
}

/** Total recipe cost = Σ line totals. */
export function recipeCost(
  items: ReadonlyArray<{ qty: number; cost_cop: number }>,
): number {
  return items.reduce((sum, it) => sum + lineTotal(it.qty, it.cost_cop), 0);
}

/**
 * Gross margin %: round((price - cost) / price * 100). Returns 0 when price
 * is 0 — mirrors the `productos.margin_pct` generated column exactly so the
 * app and DB never disagree.
 */
export function margenOf(price: number, cost: number): number {
  return price > 0 ? Math.round(((price - cost) / price) * 100) : 0;
}

export type StockLevel = "ok" | "bajo" | "sin";

/**
 * Stock health of an ingrediente given current quantity and the reorder
 * threshold: "sin" (out) when at/below 0, "bajo" (low) when at/below the
 * minimum, otherwise "ok". A threshold of 0 disables the low warning.
 */
export function stockLevel(current: number, min: number): StockLevel {
  if (current <= 0) return "sin";
  if (min > 0 && current <= min) return "bajo";
  return "ok";
}

/** Whether a stock level should raise an alert (low or out). */
export function isAlerting(level: StockLevel): boolean {
  return level === "bajo" || level === "sin";
}
