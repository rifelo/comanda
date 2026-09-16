import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { asApplied, consumptionDeltas, explodeConsumption, type ComboMap, type RecipeMap } from "./consumo";

/**
 * Keep inventory in step with an order. Idempotent: it reads what the
 * order's existing movements already took, computes what should be taken
 * for the order's current lines (nothing if cancelled), and inserts only the
 * difference — so create, edit, cancel and retries all go through this one
 * call. Never throws: a stock problem must not fail a sale; it's logged.
 *
 * Works with the RLS client (signed-in cashier) and the service-role client
 * (paired device) — every query filters organization_id by hand.
 */
export async function syncOrderConsumption(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  orgId: string,
  ordenId: string,
  createdBy: string | null,
): Promise<{ moved: number } | { error: string }> {
  try {
    const { data: orden } = await supabase
      .from("ordenes")
      .select("id, folio, status, orden_items(kind, producto_id, combo_id, qty)")
      .eq("id", ordenId)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!orden) return { error: "orden not found" };
    const folio = orden.folio as string;
    const live = orden.status === "pendiente" || orden.status === "pagada";
    const lines = ((orden as { orden_items?: Array<Record<string, unknown>> }).orden_items ?? []).map((it) => ({
      kind: it.kind as "item" | "combo",
      productoId: (it.producto_id as string | null) ?? null,
      comboId: (it.combo_id as string | null) ?? null,
      qty: Number(it.qty),
    }));

    // Recipes for the products involved (combos expanded first).
    const comboIds = [...new Set(lines.filter((l) => l.kind === "combo" && l.comboId).map((l) => l.comboId!))];
    const combos: ComboMap = new Map();
    if (comboIds.length) {
      const { data } = await supabase
        .from("combo_items")
        .select("combo_id, producto_id, qty")
        .eq("organization_id", orgId)
        .in("combo_id", comboIds);
      const m = combos as Map<string, { productoId: string; qty: number }[]>;
      for (const r of data ?? []) {
        const arr = m.get(r.combo_id as string) ?? [];
        arr.push({ productoId: r.producto_id as string, qty: Number(r.qty) });
        m.set(r.combo_id as string, arr);
      }
    }
    const productIds = new Set(lines.filter((l) => l.kind === "item" && l.productoId).map((l) => l.productoId!));
    for (const items of combos.values()) for (const c of items) productIds.add(c.productoId);
    const recipes: RecipeMap = new Map();
    if (productIds.size) {
      const { data } = await supabase
        .from("receta_items")
        .select("producto_id, ingrediente_id, qty")
        .eq("organization_id", orgId)
        .in("producto_id", [...productIds]);
      const m = recipes as Map<string, { ingredienteId: string; qty: number }[]>;
      for (const r of data ?? []) {
        const arr = m.get(r.producto_id as string) ?? [];
        arr.push({ ingredienteId: r.ingrediente_id as string, qty: Number(r.qty) });
        m.set(r.producto_id as string, arr);
      }
    }

    const desired = live ? asApplied(explodeConsumption(lines, recipes, combos)) : new Map<string, number>();

    // What this order already took (or gave back).
    const { data: prev } = await supabase
      .from("ingrediente_movements")
      .select("ingrediente_id, delta")
      .eq("organization_id", orgId)
      .eq("orden_id", ordenId);
    const applied = new Map<string, number>();
    for (const r of prev ?? []) {
      const id = r.ingrediente_id as string;
      applied.set(id, (applied.get(id) ?? 0) + Number(r.delta));
    }

    const deltas = consumptionDeltas(applied, desired);
    if (!deltas.size) return { moved: 0 };

    const { data: ings } = await supabase
      .from("ingredientes")
      .select("id, cost_cop")
      .eq("organization_id", orgId)
      .in("id", [...deltas.keys()]);
    const cost = new Map((ings ?? []).map((i) => [i.id as string, i.cost_cop as number]));

    const note = !live ? `Cancelación ${folio}` : applied.size ? `Cambio en ${folio}` : `Venta ${folio}`;
    const rows = [...deltas].map(([ingredienteId, delta]) => ({
      organization_id: orgId,
      ingrediente_id: ingredienteId,
      // Stock taken by a sale is 'venta'; anything given back is an 'ajuste'
      // (the trigger only refuses negative balances for 'gasto').
      type: delta < 0 ? "venta" : "ajuste",
      delta,
      unit_cost_cop: cost.get(ingredienteId) ?? null,
      note,
      created_by: createdBy,
      orden_id: ordenId,
    }));
    // One row at a time: the BEFORE INSERT trigger locks each ingrediente
    // and a single failure must not void the others.
    let moved = 0;
    for (const row of rows) {
      const { error } = await supabase.from("ingrediente_movements").insert(row);
      if (error) console.error(`[stock] movement failed for ${folio}:`, error.message);
      else moved += 1;
    }
    return { moved };
  } catch (err) {
    console.error("[stock] syncOrderConsumption failed:", err);
    return { error: err instanceof Error ? err.message : "stock sync failed" };
  }
}
