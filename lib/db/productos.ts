import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  CatalogoCategoryNode,
  CatalogoRow,
  Producto,
  ProductoCategoria,
} from "@/lib/types";

const PRODUCTO_COLUMNS =
  "id, organization_id, category_id, name, sku, price_cop, cost_cop, margin_pct, stock_status, created_at, updated_at" as const;

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
