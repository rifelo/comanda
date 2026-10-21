import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * «Costos por revisar»: the facts that make a margin a lie — ingredients used
 * in recipes with no cost, products sold at price 0, products under the
 * minimum margin, and items the system believes are negative. Read-only; the
 * panel on /recetas and the summary on /inventario show them.
 */

export const MARGEN_MIN = 55;

export interface CostosPendientes {
  /** Active ingredients at cost 0 that at least one recipe uses. */
  sinCosto: { id: string; name: string; unit: string; recetas: number; stock: number }[];
  /** Products on sale at price 0. */
  precioCero: { id: string; sku: string; name: string }[];
  /** Products with a recipe under MARGEN_MIN (price > 0). */
  bajoMargen: { id: string; sku: string; name: string; price_cop: number; cost_cop: number; margin_pct: number }[];
  /** Active ingredients the system has below zero. */
  negativos: { id: string; name: string; unit: string; stock: number }[];
  /** Products without a recipe (their cost is whatever someone typed). */
  sinReceta: { id: string; sku: string; name: string }[];
}

export async function getCostosPendientes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any>,
  orgId: string,
): Promise<CostosPendientes> {
  const [{ data: ings }, { data: prods }, { data: recetas }] = await Promise.all([
    db.from("ingredientes").select("id, name, unit, cost_cop, stock_current").eq("organization_id", orgId).eq("archived", false),
    db.from("productos").select("id, sku, name, price_cop, cost_cop, margin_pct").eq("organization_id", orgId),
    db.from("receta_items").select("producto_id, ingrediente_id").eq("organization_id", orgId),
  ]);
  const usos = new Map<string, number>();
  const conReceta = new Set<string>();
  for (const r of recetas ?? []) {
    usos.set(r.ingrediente_id as string, (usos.get(r.ingrediente_id as string) ?? 0) + 1);
    conReceta.add(r.producto_id as string);
  }
  const sinCosto: CostosPendientes["sinCosto"] = [];
  const negativos: CostosPendientes["negativos"] = [];
  for (const i of ings ?? []) {
    const stock = Number(i.stock_current ?? 0);
    const recetasN = usos.get(i.id as string) ?? 0;
    if (Number(i.cost_cop ?? 0) === 0 && recetasN > 0) sinCosto.push({ id: i.id as string, name: i.name as string, unit: i.unit as string, recetas: recetasN, stock });
    if (stock < 0) negativos.push({ id: i.id as string, name: i.name as string, unit: i.unit as string, stock });
  }
  const precioCero: CostosPendientes["precioCero"] = [];
  const bajoMargen: CostosPendientes["bajoMargen"] = [];
  const sinReceta: CostosPendientes["sinReceta"] = [];
  for (const p of prods ?? []) {
    const row = { id: p.id as string, sku: p.sku as string, name: p.name as string };
    const price = Number(p.price_cop ?? 0);
    if (price <= 0) precioCero.push(row);
    else if (conReceta.has(row.id) && Number(p.margin_pct ?? 0) < MARGEN_MIN) bajoMargen.push({ ...row, price_cop: price, cost_cop: Number(p.cost_cop ?? 0), margin_pct: Number(p.margin_pct ?? 0) });
    if (!conReceta.has(row.id)) sinReceta.push(row);
  }
  sinCosto.sort((a, b) => b.recetas - a.recetas || a.name.localeCompare(b.name));
  negativos.sort((a, b) => a.name.localeCompare(b.name));
  bajoMargen.sort((a, b) => a.margin_pct - b.margin_pct);
  precioCero.sort((a, b) => a.sku.localeCompare(b.sku));
  sinReceta.sort((a, b) => a.sku.localeCompare(b.sku));
  return { sinCosto, precioCero, bajoMargen, negativos, sinReceta };
}

/** How many things need a look — the badge number. */
export function totalPendientes(c: CostosPendientes): number {
  return c.sinCosto.length + c.precioCero.length + c.bajoMargen.length + c.negativos.length;
}
