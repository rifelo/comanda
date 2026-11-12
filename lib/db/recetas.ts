import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lineTotal, recipeCost, margenOf } from "@/lib/cost";
import { preparacionesQueUsan, recostearPreparacion } from "@/lib/inventario/preparaciones-db";

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
  /** Product photo from the catálogo, if any. */
  image_url: string | null;
  /** Preparation steps, one per line ("" when none). */
  preparacion: string;
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
        .select("id, name, sku, price_cop, category_id, image_url, preparacion")
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
      total: lineTotal(qty, costPerUnit),
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
        image_url: ((p.image_url as string | null) ?? "").trim() || null,
        preparacion: (p.preparacion as string | null) ?? "",
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

// =============================================================================
// /productos/[id] (P4) — one product with its recipe, ready to edit inline
// =============================================================================

export interface FichaLinea extends RecetaItemRow {
  stock: number;
  stock_min: number;
}

export interface FichaIngrediente extends IngredienteOption {
  stock: number;
}

export interface ProductoFicha {
  producto: {
    id: string;
    name: string;
    sku: string;
    description: string | null;
    category_id: string | null;
    category_label: string | null;
    price_cop: number;
    cost_cop: number;
    margin_pct: number;
    stock_status: "ok" | "bajo" | "sin";
    image_url: string | null;
    preparacion: string;
    is_favorite: boolean;
  };
  lineas: FichaLinea[];
  ingredientes: FichaIngrediente[];
  /** Ingredient ids most recently added to any recipe (newest first). */
  recientes: string[];
  /** How many recipes use each ingredient. */
  usos: Record<string, number>;
  /** Other products with a recipe, to duplicate from. */
  otras: { id: string; name: string; sku: string; lineas: { ingrediente_id: string; qty: number }[] }[];
  /** Every modifier group, flagged when it applies to this product. */
  grupos: { id: string; name: string; required: boolean; opciones: string[]; aplicado: boolean }[];
  /** Leaf categories for the «Datos» select. */
  categorias: { id: string; label: string }[];
  /** Units sold in the last 30 days (paid orders). */
  vendidas30: number;
}

/** One product for its ficha, or null when it isn't in the org. */
export async function getProductoFicha(organizationId: string, userId: string, productoId: string): Promise<ProductoFicha | null> {
  const supabase = await createSupabaseServerClient();
  const desde = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [{ data: p }, { data: items }, { data: ings }, { data: cats }, { data: fav }, { data: groups }, { data: opts }, { data: applied }, { data: prods }, { data: vendidas }] = await Promise.all([
    supabase
      .from("productos")
      .select("id, name, sku, description, category_id, price_cop, cost_cop, margin_pct, stock_status, image_url, preparacion")
      .eq("organization_id", organizationId)
      .eq("id", productoId)
      .maybeSingle(),
    supabase
      .from("receta_items")
      .select("id, producto_id, ingrediente_id, qty, unit, note, position, created_at, ingredientes(name, unit, cost_cop, stock_current, stock_min)")
      .eq("organization_id", organizationId)
      .order("position")
      .order("created_at"),
    supabase.from("ingredientes").select("id, name, unit, cost_cop, stock_current").eq("organization_id", organizationId).eq("archived", false).order("name"),
    supabase.from("producto_categorias").select("id, parent_id, label").eq("organization_id", organizationId).order("position"),
    supabase.from("producto_favorites").select("producto_id").eq("user_id", userId).eq("producto_id", productoId),
    supabase.from("modifier_groups").select("id, name, required, position").eq("organization_id", organizationId).order("position").order("name"),
    supabase.from("modifier_options").select("group_id, name, position").eq("organization_id", organizationId).order("position"),
    supabase.from("producto_modifier_groups").select("group_id").eq("organization_id", organizationId).eq("producto_id", productoId),
    supabase.from("productos").select("id, name, sku").eq("organization_id", organizationId).order("name"),
    supabase
      .from("orden_items")
      .select("qty, ordenes!inner(status, created_at)")
      .eq("producto_id", productoId)
      .eq("ordenes.status", "pagada")
      .gte("ordenes.created_at", desde),
  ]);
  if (!p) return null;

  const catById = new Map((cats ?? []).map((c) => [c.id as string, c as { id: string; parent_id: string | null; label: string }]));
  const labelFor = (id: string | null) => {
    const c = id ? catById.get(id) : undefined;
    if (!c) return null;
    const parent = c.parent_id ? catById.get(c.parent_id) : null;
    return parent ? `${parent.label} · ${c.label}` : c.label;
  };
  const conHijos = new Set((cats ?? []).filter((c) => c.parent_id).map((c) => c.parent_id as string));

  const lineas: FichaLinea[] = [];
  const usos: Record<string, number> = {};
  const porProducto = new Map<string, { ingrediente_id: string; qty: number }[]>();
  const recientesOrden: { id: string; at: string }[] = [];
  for (const it of items ?? []) {
    const ingId = it.ingrediente_id as string;
    usos[ingId] = (usos[ingId] ?? 0) + 1;
    recientesOrden.push({ id: ingId, at: (it.created_at as string) ?? "" });
    const arr = porProducto.get(it.producto_id as string) ?? [];
    arr.push({ ingrediente_id: ingId, qty: Number(it.qty) });
    porProducto.set(it.producto_id as string, arr);
    if (it.producto_id !== productoId) continue;
    const ing = (Array.isArray(it.ingredientes) ? it.ingredientes[0] : it.ingredientes) as { name: string; unit: string; cost_cop: number; stock_current: number; stock_min: number } | null;
    const qty = Number(it.qty);
    const cost = Number(ing?.cost_cop ?? 0);
    lineas.push({
      id: it.id as string,
      ingrediente_id: ingId,
      name: ing?.name ?? "—",
      qty,
      unit: (it.unit as string) ?? ing?.unit ?? "",
      cost_cop: cost,
      total: lineTotal(qty, cost),
      note: (it.note as string | null) ?? null,
      stock: Number(ing?.stock_current ?? 0),
      stock_min: Number(ing?.stock_min ?? 0),
    });
  }
  recientesOrden.sort((a, b) => b.at.localeCompare(a.at));
  const recientes: string[] = [];
  for (const r of recientesOrden) {
    if (!recientes.includes(r.id)) recientes.push(r.id);
    if (recientes.length >= 6) break;
  }

  const opcionesPorGrupo = new Map<string, string[]>();
  for (const o of opts ?? []) {
    const arr = opcionesPorGrupo.get(o.group_id as string) ?? [];
    arr.push(o.name as string);
    opcionesPorGrupo.set(o.group_id as string, arr);
  }
  const aplicados = new Set((applied ?? []).map((a) => a.group_id as string));

  const price = Number(p.price_cop ?? 0);
  return {
    producto: {
      id: p.id as string,
      name: p.name as string,
      sku: p.sku as string,
      description: (p.description as string | null) ?? null,
      category_id: (p.category_id as string | null) ?? null,
      category_label: labelFor((p.category_id as string | null) ?? null),
      price_cop: price,
      cost_cop: Number(p.cost_cop ?? 0),
      margin_pct: Number(p.margin_pct ?? 0),
      stock_status: ((p.stock_status as string) ?? "ok") as "ok" | "bajo" | "sin",
      image_url: ((p.image_url as string | null) ?? "").trim() || null,
      preparacion: (p.preparacion as string | null) ?? "",
      is_favorite: (fav ?? []).length > 0,
    },
    lineas,
    ingredientes: (ings ?? []).map((i) => ({ id: i.id as string, name: i.name as string, unit: i.unit as string, cost_cop: Number(i.cost_cop ?? 0), stock: Number(i.stock_current ?? 0) })),
    recientes,
    usos,
    otras: (prods ?? [])
      .filter((x) => x.id !== productoId && porProducto.has(x.id as string))
      .map((x) => ({ id: x.id as string, name: x.name as string, sku: x.sku as string, lineas: porProducto.get(x.id as string)! })),
    grupos: (groups ?? []).map((g) => ({ id: g.id as string, name: g.name as string, required: Boolean(g.required), opciones: opcionesPorGrupo.get(g.id as string) ?? [], aplicado: aplicados.has(g.id as string) })),
    categorias: (cats ?? [])
      .filter((c) => !conHijos.has(c.id as string))
      .map((c) => ({ id: c.id as string, label: labelFor(c.id as string) ?? (c.label as string) }))
      .sort((a, b) => a.label.localeCompare(b.label, "es")),
    vendidas30: (vendidas ?? []).reduce((n, v) => n + Number(v.qty ?? 0), 0),
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

  const cost = recipeCost(
    (items ?? []).map((it) => ({
      qty: Number(it.qty),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cost_cop: ((it as any).ingredientes?.cost_cop ?? 0) as number,
    })),
  );

  // Only cost_cop is writable — productos.margin_pct is a generated column
  // (round((price - cost) / price * 100)), so the DB recomputes margin itself.
  await supabase
    .from("productos")
    .update({ cost_cop: cost })
    .eq("id", productoId)
    .eq("organization_id", organizationId);
}

/**
 * Recompute every producto whose recipe uses a given ingrediente. Call after
 * an ingrediente's cost_cop changes (e.g. a new pack price) so the rolled-up
 * producto cost_cop / margin_pct stay in sync — receta mutations recompute on
 * their own, but editing the ingrediente itself otherwise wouldn't cascade.
 */
export async function recomputeProductosForIngrediente(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  organizationId: string,
  ingredienteId: string,
  depth = 0,
): Promise<void> {
  const { data: rows } = await supabase
    .from("receta_items")
    .select("producto_id")
    .eq("organization_id", organizationId)
    .eq("ingrediente_id", ingredienteId);

  const productoIds = [...new Set((rows ?? []).map((r) => r.producto_id as string))];
  for (const productoId of productoIds) {
    await recomputeProductoCost(supabase, organizationId, productoId);
  }
  // A house preparación that takes this ingredient (crema chantilly…) changes
  // cost too, and so do the products that use it. Preparaciones don't nest
  // (mig 0082), so one level is enough.
  if (depth > 0) return;
  for (const prepId of await preparacionesQueUsan(supabase, organizationId, ingredienteId)) {
    if ((await recostearPreparacion(supabase, organizationId, prepId)) != null) {
      await recomputeProductosForIngrediente(supabase, organizationId, prepId, depth + 1);
    }
  }
}
