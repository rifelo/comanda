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
 * divided by how many units it holds, kept to 2 decimals because g / ml
 * ingredients cost fractions of a peso (a 900 ml bag of milk at 3.250 is
 * 3,61 COP/ml; rounding to 4 overstated every milk recipe by 11 %). Returns
 * 0 when the pack quantity isn't positive (avoids divide-by-zero). Mirrors
 * the `cost_cop = pack_cost_cop / pack_qty` rule the inventario action
 * applies when an ingrediente is bought by pack.
 * Example: unitCostFromPack(4400, 12) === 366.67.
 */
export function unitCostFromPack(packCost: number, packQty: number): number {
  return packQty > 0 ? Math.round((packCost / packQty) * 100) / 100 : 0;
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

/**
 * The owner's rule for drinks: a recipe must leave at least 55 % of the price
 * (cost ≤ 45 %). Products under it show up in «Costos por revisar».
 */
export const MARGEN_MIN = 55;

/** True when a margin meets the minimum (55 % by default). */
export function margenOk(margin: number, min: number = MARGEN_MIN): boolean {
  return margin >= min;
}

/**
 * Lowest price that reaches the minimum margin for a cost, rounded UP to the
 * next $500 (menu prices in Colombia go in 500s). 0 when there is no cost.
 * Example: cost 4.000 at 55 % → 4.000 / 0,45 = 8.888,9 → 9.000.
 */
export function precioParaMargen(cost: number, min: number = MARGEN_MIN, paso = 500): number {
  if (!(cost > 0) || min >= 100) return 0;
  const exacto = cost / (1 - min / 100);
  return Math.ceil(exacto / paso - 1e-9) * paso;
}

/**
 * Everything the recipe editor shows under the lines, recomputed live as the
 * owner types: cost (Σ lines), margin (same rule as the DB column), profit per
 * unit, whether it passes the minimum, and the price that would.
 */
export function resumenReceta(
  items: ReadonlyArray<{ qty: number; cost_cop: number }>,
  price: number,
  min: number = MARGEN_MIN,
): { costo: number; margen: number; utilidad: number; ok: boolean; precioSugerido: number; costoPct: number } {
  const costo = recipeCost(items);
  const margen = margenOf(price, costo);
  return {
    costo,
    margen,
    utilidad: price - costo,
    ok: price > 0 && margenOk(margen, min),
    precioSugerido: precioParaMargen(costo, min),
    costoPct: price > 0 ? Math.round((costo / price) * 100) : 0,
  };
}
