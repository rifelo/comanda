import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Recetas (module 03) — a recipe is the bill of materials for a producto.
 * Each line links an ingrediente with a quantity; line cost = qty ×
 * ingrediente.cost_cop, recipe cost = Σ lines. The producto carries the
 * rolled-up cost_cop / margin_pct (kept in sync by the server actions), so
 * the catálogo and recetas views agree.
 */

export interface RecetaItemRow {
  id: string;
  ingrediente_id: string;
  name: string;
  qty: number;
  unit: string;
  cost_cop: number; // ingrediente cost per unit
  total: number; // qty × cost_cop, rounded
  note: string | null;
}

export interface RecetaRow {
  producto_id: string;
  product: string;
  sku: string;
  category_label: string | null;
  price_cop: number;
  items: RecetaItemRow[];
  cost: number;
  margin_pct: number;
}

export interface IngredienteOption {
  id: string;
  name: string;
  unit: string;
  cost_cop: number;
}

export interface RecetasView {
  recetas: RecetaRow[];
  /** Productos that don't yet have a recipe — selectable in "Nueva receta". */
  productosSinReceta: { id: string; name: string; sku: string }[];
  /** All active ingredientes, for the add-ingredient picker. */
  ingredientes: IngredienteOption[];
}

const margenOf = (price: number, cost: number): number =>
  price > 0 ? Math.round(((price - cost) / price) * 100) : 0;

export async function getRecetasView(
  organizationId: string,
): Promise<RecetasView> {
  const supabase = await createSupabaseServerClient();

  const [{ data: items }, { data: productos }, { data: cats }, { data: ings }] =
    await Promise.all([
      supabase
        .from("receta_items")
        .select(
          "id, producto_id, ingrediente_id, qty, unit, note, position, ingredientes(name, unit, cost_cop)",
        )
        .eq("organization_id", organizationId)
        .order("position"),
      supabase
        .from("productos")
        .select("id, name, sku, price_cop, category_id")
        .eq("organization_id", organizationId)
        .order("name"),
      supabase
        .from("producto_categorias")
        .select("id, parent_id, label")
        .eq("organization_id", organizationId),
      supabase
        .from("ingredientes")
        .select("id, name, unit, cost_cop")
        .eq("organization_id", organizationId)
        .eq("archived", false)
        .order("name"),
    ]);

  // Category breadcrumb labels (parent · child).
  const catById = new Map(
    (cats ?? []).map((c) => [c.id as string, c as { id: string; parent_id: string | null; label: string }]),
  );
  const labelFor = (categoryId: string | null): string | null => {
    if (!categoryId) return null;
    const c = catById.get(categoryId);
    if (!c) return null;
    const parent = c.parent_id ? catById.get(c.parent_id) : null;
    return parent ? `${parent.label} · ${c.label}` : c.label;
  };

  // Group recipe items by producto.
  const byProducto = new Map<string, RecetaItemRow[]>();
  for (const it of items ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ing = (it as any).ingredientes as
      | { name: string; unit: string; cost_cop: number }
      | null;
    const qty = Number(it.qty);
    const costPerUnit = ing?.cost_cop ?? 0;
    const row: RecetaItemRow = {
      id: it.id as string,
      ingrediente_id: it.ingrediente_id as string,
      name: ing?.name ?? "—",
      qty,
      unit: (it.unit as string) ?? ing?.unit ?? "",
      cost_cop: costPerUnit,
      total: Math.round(qty * costPerUnit),
      note: (it.note as string | null) ?? null,
    };
    const arr = byProducto.get(it.producto_id as string) ?? [];
    arr.push(row);
    byProducto.set(it.producto_id as string, arr);
  }

  const recetas: RecetaRow[] = [];
  const productosSinReceta: { id: string; name: string; sku: string }[] = [];
  for (const p of productos ?? []) {
    const lines = byProducto.get(p.id as string);
    if (lines && lines.length > 0) {
      const cost = lines.reduce((s, x) => s + x.total, 0);
      recetas.push({
        producto_id: p.id as string,
        product: p.name as string,
        sku: p.sku as string,
        category_label: labelFor(p.category_id as string | null),
        price_cop: p.price_cop as number,
        items: lines,
        cost,
        margin_pct: margenOf(p.price_cop as number, cost),
      });
    } else {
      productosSinReceta.push({
        id: p.id as string,
        name: p.name as string,
        sku: p.sku as string,
      });
    }
  }

  return {
    recetas,
    productosSinReceta,
    ingredientes: (ings ?? []).map((i) => ({
      id: i.id as string,
      name: i.name as string,
      unit: i.unit as string,
      cost_cop: i.cost_cop as number,
    })),
  };
}

/**
 * Recompute a producto's rolled-up cost_cop / margin_pct from its recipe
 * items. Call after any receta_items mutation. Shared by the server actions.
 */
export async function recomputeProductoCost(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  organizationId: string,
  productoId: string,
): Promise<void> {
  const { data: items } = await supabase
    .from("receta_items")
    .select("qty, ingredientes(cost_cop)")
    .eq("organization_id", organizationId)
    .eq("producto_id", productoId);

  const cost = (items ?? []).reduce((s, it) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = ((it as any).ingredientes?.cost_cop ?? 0) as number;
    return s + Math.round(Number(it.qty) * c);
  }, 0);

  // Only cost_cop is writable — productos.margin_pct is a generated column
  // (round((price - cost) / price * 100)), so the DB recomputes margin itself.
  await supabase
    .from("productos")
    .update({ cost_cop: cost })
    .eq("id", productoId)
    .eq("organization_id", organizationId);
}
