/**
 * Pure recipe explosion for POS orders (no I/O, unit-tested): turns the
 * lines of an order into ingredient quantities using the recipes, expanding
 * combos to their products first. A modifier option may carry ingredients of
 * its own (a juice "en leche" takes the milk): they add to the product's.
 * Or it swaps one (0071): «Deslactosada» takes lactose-free milk in place of
 * the whole milk, in whatever amount that drink's recipe uses.
 */

export interface ConsumoLine {
  kind: "item" | "combo";
  productoId: string | null;
  comboId: string | null;
  qty: number;
  /** Ids of the modifier options chosen on the line. */
  optionIds?: ReadonlyArray<string>;
}
/** producto_id → recipe lines (ingrediente_id, qty per unit sold). */
export type RecipeMap = ReadonlyMap<string, ReadonlyArray<{ ingredienteId: string; qty: number }>>;
/** combo_id → products bundled (producto_id, qty per combo). */
export type ComboMap = ReadonlyMap<string, ReadonlyArray<{ productoId: string; qty: number }>>;
/**
 * option_id → what the option takes per unit sold (modifier_option_receta, 0048).
 * With `reemplazaId`, `qty` is a factor: the recipe's amount of `reemplazaId`
 * (× qty) is taken from `ingredienteId` instead.
 */
export type OptionRecipeMap = ReadonlyMap<string, ReadonlyArray<{ ingredienteId: string; qty: number; reemplazaId?: string | null }>>;

/**
 * The options chosen on a line, out of its `mods` ({ groupId: name | name[] }).
 * The POS stores the option's name, so the caller resolves each pair to its id.
 */
export function modPairsOf(mods: unknown): { groupId: string; name: string }[] {
  if (!mods || typeof mods !== "object") return [];
  return Object.entries(mods as Record<string, unknown>).flatMap(([groupId, v]) =>
    (Array.isArray(v) ? v : [v]).filter((n): n is string => typeof n === "string" && n.length > 0).map((name) => ({ groupId, name })),
  );
}

/** ingrediente_id → total quantity consumed by the order (positive numbers). */
export function explodeConsumption(
  lines: ReadonlyArray<ConsumoLine>,
  recipes: RecipeMap,
  combos: ComboMap,
  options: OptionRecipeMap = new Map(),
): Map<string, number> {
  const out = new Map<string, number>();
  const add = (m: Map<string, number>, id: string, qty: number) => m.set(id, round3((m.get(id) ?? 0) + qty));
  for (const l of lines) {
    if (l.qty <= 0) continue;
    // The line's recipe first, so a swap knows how much the drink uses.
    const line = new Map<string, number>();
    const addProduct = (productoId: string, units: number) => {
      for (const r of recipes.get(productoId) ?? []) add(line, r.ingredienteId, r.qty * units);
    };
    if (l.kind === "item" && l.productoId) addProduct(l.productoId, l.qty);
    else if (l.kind === "combo" && l.comboId) {
      for (const c of combos.get(l.comboId) ?? []) addProduct(c.productoId, c.qty * l.qty);
    }
    for (const oid of l.optionIds ?? []) {
      for (const r of options.get(oid) ?? []) {
        if (r.reemplazaId) {
          const moved = round3((line.get(r.reemplazaId) ?? 0) * r.qty);
          if (moved <= 0) continue;
          add(line, r.reemplazaId, -moved);
          if ((line.get(r.reemplazaId) ?? 0) === 0) line.delete(r.reemplazaId);
          add(line, r.ingredienteId, moved);
        } else add(line, r.ingredienteId, r.qty * l.qty);
      }
    }
    for (const [id, qty] of line) add(out, id, qty);
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
