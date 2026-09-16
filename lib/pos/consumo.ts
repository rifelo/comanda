/**
 * Pure recipe explosion for POS orders (no I/O, unit-tested): turns the
 * lines of an order into ingredient quantities using the recipes, expanding
 * combos to their products first. Modifiers carry no ingredients today.
 */

export interface ConsumoLine {
  kind: "item" | "combo";
  productoId: string | null;
  comboId: string | null;
  qty: number;
}
/** producto_id → recipe lines (ingrediente_id, qty per unit sold). */
export type RecipeMap = ReadonlyMap<string, ReadonlyArray<{ ingredienteId: string; qty: number }>>;
/** combo_id → products bundled (producto_id, qty per combo). */
export type ComboMap = ReadonlyMap<string, ReadonlyArray<{ productoId: string; qty: number }>>;

/** ingrediente_id → total quantity consumed by the order (positive numbers). */
export function explodeConsumption(
  lines: ReadonlyArray<ConsumoLine>,
  recipes: RecipeMap,
  combos: ComboMap,
): Map<string, number> {
  const out = new Map<string, number>();
  const addProduct = (productoId: string, units: number) => {
    for (const r of recipes.get(productoId) ?? []) {
      out.set(r.ingredienteId, round3((out.get(r.ingredienteId) ?? 0) + r.qty * units));
    }
  };
  for (const l of lines) {
    if (l.qty <= 0) continue;
    if (l.kind === "item" && l.productoId) addProduct(l.productoId, l.qty);
    else if (l.kind === "combo" && l.comboId) {
      for (const c of combos.get(l.comboId) ?? []) addProduct(c.productoId, c.qty * l.qty);
    }
  }
  return out;
}

/**
 * Movements needed to go from what is already applied for an order to the
 * desired state. `applied` = Σ deltas of the order's existing movements per
 * ingredient (negative when stock was taken); `desired` = -consumption for a
 * live order, or an empty map when the order is cancelled. Returns the
 * non-zero deltas to insert (negative = take more, positive = give back).
 */
export function consumptionDeltas(
  applied: ReadonlyMap<string, number>,
  desired: ReadonlyMap<string, number>,
): Map<string, number> {
  const out = new Map<string, number>();
  const ids = new Set([...applied.keys(), ...desired.keys()]);
  for (const id of ids) {
    const d = round3((desired.get(id) ?? 0) - (applied.get(id) ?? 0));
    if (Math.abs(d) >= 0.001) out.set(id, d);
  }
  return out;
}

/** Negate a consumption map into the "desired applied" form (stock taken = negative). */
export function asApplied(consumption: ReadonlyMap<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  for (const [id, q] of consumption) if (q > 0) out.set(id, -q);
  return out;
}

/** numeric(12,3) in the DB — keep client math on the same grid. */
export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
