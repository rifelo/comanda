import { createSupabaseServerClient } from "@/lib/supabase/server";
import { stockDeReceta } from "@/lib/inventario/existencias";
import type {
  CatalogoCategoryNode,
  CatalogoRow,
  Producto,
  ProductoCategoria,
} from "@/lib/types";

const PRODUCTO_COLUMNS =
  "id, organization_id, category_id, name, description, sku, price_cop, cost_cop, margin_pct, stock_status, created_at, updated_at" as const;

const CATEGORIA_COLUMNS =
  "id, organization_id, parent_id, label, position, created_at" as const;

/**
 * All productos in the calling user's organization, hydrated with the
 * category breadcrumb label and a `is_favorite` flag from the calling
 * user's `producto_favorites`.
 *
 * Filtering (search, stock chip, fav toggle, category) happens client-side
 * over this list — the catálogo dataset is small enough that fetching the
 * whole set and filtering in `catalogo-client.tsx` preserves the existing
 * UX without round-trips.
 */
export async function listCatalogo({
  organizationId,
  userId,
}: {
  organizationId: string;
  userId: string;
}): Promise<CatalogoRow[]> {
  const supabase = await createSupabaseServerClient();

  const [
    { data: productos },
    { data: categorias },
    { data: favorites },
  ] = await Promise.all([
    supabase
      .from("productos")
      .select(PRODUCTO_COLUMNS)
      .eq("organization_id", organizationId)
      .order("name"),
    supabase
      .from("producto_categorias")
      .select(CATEGORIA_COLUMNS)
      .eq("organization_id", organizationId),
    supabase
      .from("producto_favorites")
      .select("producto_id")
      .eq("user_id", userId),
  ]);

  const categoriaById = new Map<string, ProductoCategoria>();
  for (const c of (categorias ?? []) as ProductoCategoria[]) {
    categoriaById.set(c.id, c);
  }

  const labelFor = (categoryId: string | null): string | null => {
    if (!categoryId) return null;
    const cat = categoriaById.get(categoryId);
    if (!cat) return null;
    const parent = cat.parent_id ? categoriaById.get(cat.parent_id) : null;
    return parent ? `${parent.label} · ${cat.label}` : cat.label;
  };

  const favSet = new Set((favorites ?? []).map((f) => f.producto_id));

  return ((productos ?? []) as Producto[]).map((p) => ({
    ...p,
    category_label: labelFor(p.category_id),
    is_favorite: favSet.has(p.id),
  }));
}

/**
 * Categorías for the org assembled into the tree shape the catálogo rail
 * expects (a synthetic "Todas las categorías" root + parents + children),
 * with descendant-inclusive product counts.
 */
export async function listProductoCategorias({
  organizationId,
}: {
  organizationId: string;
}): Promise<CatalogoCategoryNode[]> {
  const supabase = await createSupabaseServerClient();

  const [{ data: rows }, { data: productos }] = await Promise.all([
    supabase
      .from("producto_categorias")
      .select(CATEGORIA_COLUMNS)
      .eq("organization_id", organizationId)
      .order("position"),
    supabase
      .from("productos")
      .select("category_id")
      .eq("organization_id", organizationId),
  ]);

  const categorias = (rows ?? []) as ProductoCategoria[];
  const productosByCategory = new Map<string | null, number>();
  for (const p of productos ?? []) {
    const k = (p.category_id ?? null) as string | null;
    productosByCategory.set(k, (productosByCategory.get(k) ?? 0) + 1);
  }

  const byParent = new Map<string | null, ProductoCategoria[]>();
  for (const c of categorias) {
    const arr = byParent.get(c.parent_id) ?? [];
    arr.push(c);
    byParent.set(c.parent_id, arr);
  }

  const countOf = (id: string | null): number => {
    const direct = productosByCategory.get(id) ?? 0;
    const children = byParent.get(id) ?? [];
    return direct + children.reduce((acc, c) => acc + countOf(c.id), 0);
  };

  const buildNode = (c: ProductoCategoria, indent: number): CatalogoCategoryNode => {
    const children = (byParent.get(c.id) ?? []).map((child) =>
      buildNode(child, indent + 1),
    );
    return {
      id: c.id,
      label: c.label,
      count: countOf(c.id),
      indent,
      parent_id: c.parent_id,
      ...(children.length ? { children } : {}),
    };
  };

  const roots = (byParent.get(null) ?? []).map((c) => buildNode(c, 1));
  const totalCount = (productos ?? []).length;

  return [
    {
      id: null,
      label: "Todas las categorías",
      count: totalCount,
      indent: 0,
      parent_id: null,
    },
    ...roots,
  ];
}

// =============================================================================
// /productos (P4) — one list for Catálogo + Recetas
// =============================================================================

export interface ProductoListRow {
  id: string;
  name: string;
  sku: string;
  category_id: string | null;
  /** Root category id (the product's parent category, or itself). */
  root_category_id: string | null;
  category_label: string | null;
  price_cop: number;
  cost_cop: number;
  margin_pct: number;
  is_favorite: boolean;
  image_url: string | null;
  /** Recipe lines (0 = no recipe: its cost is whatever was typed). */
  lineas: number;
  /** Stock state of the recipe's ingredients; null without a recipe. */
  stock: "ok" | "bajo" | "sin" | null;
  /** First short ingredient, to name it. */
  falta: string | null;
}

export interface ProductosView {
  productos: ProductoListRow[];
  /** Root categories (with product counts, descendants included), by position. */
  categorias: { id: string; label: string; count: number }[];
  /** Leaf categories for the «Nuevo producto» select («Bebidas · Calientes»). */
  hojas: { id: string; label: string }[];
  /** Every category (for the categories sheet), with direct product counts. */
  todas: { id: string; label: string; parent_id: string | null; count: number }[];
  skus: string[];
}

/**
 * Everything /productos lists: price, recipe cost and margin, the recipe's
 * stock state and the user's ★ (the POS «Favoritos» tab). One round of
 * parallel reads, joined in memory (≈ 100 products).
 */
export async function listProductosView({ organizationId, userId }: { organizationId: string; userId: string }): Promise<ProductosView> {
  const supabase = await createSupabaseServerClient();
  const [{ data: productos }, { data: categorias }, { data: favorites }, { data: lineas }] = await Promise.all([
    supabase.from("productos").select("id, category_id, name, sku, price_cop, cost_cop, margin_pct, image_url").eq("organization_id", organizationId).order("name"),
    supabase.from("producto_categorias").select(CATEGORIA_COLUMNS).eq("organization_id", organizationId).order("position"),
    supabase.from("producto_favorites").select("producto_id").eq("user_id", userId),
    supabase.from("receta_items").select("producto_id, ingredientes(name, stock_current, stock_min)").eq("organization_id", organizationId),
  ]);
  const cats = (categorias ?? []) as ProductoCategoria[];
  const catById = new Map(cats.map((c) => [c.id, c]));
  const rootOf = (id: string | null): string | null => {
    let c = id ? catById.get(id) : undefined;
    let guard = 0;
    while (c?.parent_id && guard++ < 8) c = catById.get(c.parent_id) ?? undefined;
    return c?.id ?? null;
  };
  const labelFor = (categoryId: string | null): string | null => {
    const cat = categoryId ? catById.get(categoryId) : undefined;
    if (!cat) return null;
    const parent = cat.parent_id ? catById.get(cat.parent_id) : null;
    return parent ? `${parent.label} · ${cat.label}` : cat.label;
  };
  const favSet = new Set((favorites ?? []).map((f) => f.producto_id as string));
  const porProducto = new Map<string, { name: string; stock: number; min: number }[]>();
  for (const l of lineas ?? []) {
    const ing = (Array.isArray(l.ingredientes) ? l.ingredientes[0] : l.ingredientes) as { name: string; stock_current: number; stock_min: number } | null;
    const arr = porProducto.get(l.producto_id as string) ?? [];
    arr.push({ name: ing?.name ?? "—", stock: Number(ing?.stock_current ?? 0), min: Number(ing?.stock_min ?? 0) });
    porProducto.set(l.producto_id as string, arr);
  }

  const rows: ProductoListRow[] = (productos ?? []).map((p) => {
    const ls = porProducto.get(p.id as string) ?? [];
    const st = stockDeReceta(ls);
    const categoryId = (p.category_id as string | null) ?? null;
    return {
      id: p.id as string,
      name: p.name as string,
      sku: p.sku as string,
      category_id: categoryId,
      root_category_id: rootOf(categoryId),
      category_label: labelFor(categoryId),
      price_cop: Number(p.price_cop ?? 0),
      cost_cop: Number(p.cost_cop ?? 0),
      margin_pct: Number(p.margin_pct ?? 0),
      is_favorite: favSet.has(p.id as string),
      image_url: ((p.image_url as string | null) ?? "").trim() || null,
      lineas: ls.length,
      stock: st.estado,
      falta: st.falta,
    };
  });

  const countByRoot = new Map<string, number>();
  const countDirect = new Map<string, number>();
  for (const r of rows) {
    if (r.root_category_id) countByRoot.set(r.root_category_id, (countByRoot.get(r.root_category_id) ?? 0) + 1);
    if (r.category_id) countDirect.set(r.category_id, (countDirect.get(r.category_id) ?? 0) + 1);
  }
  const hasChildren = new Set(cats.filter((c) => c.parent_id).map((c) => c.parent_id as string));

  return {
    productos: rows,
    categorias: cats.filter((c) => !c.parent_id).map((c) => ({ id: c.id, label: c.label, count: countByRoot.get(c.id) ?? 0 })),
    hojas: cats
      .filter((c) => !hasChildren.has(c.id))
      .map((c) => ({ id: c.id, label: labelFor(c.id) ?? c.label }))
      .sort((a, b) => a.label.localeCompare(b.label, "es")),
    todas: cats.map((c) => ({ id: c.id, label: c.label, parent_id: c.parent_id, count: countDirect.get(c.id) ?? 0 })),
    skus: rows.map((r) => r.sku),
  };
}
