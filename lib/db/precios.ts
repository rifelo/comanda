import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface PriceListMeta {
  id: string;
  name: string;
  description: string | null;
}

export interface PrecioProductoRow {
  producto_id: string;
  name: string;
  category_label: string | null;
  base: number;
  /** price_list_id → override price (absent = falls back to base). */
  overrides: Record<string, number>;
}

export interface PreciosView {
  lists: PriceListMeta[];
  productos: PrecioProductoRow[];
}

export async function getPreciosView(
  organizationId: string,
): Promise<PreciosView> {
  const supabase = await createSupabaseServerClient();
  const [{ data: lists }, { data: productos }, { data: cats }, { data: items }] =
    await Promise.all([
      supabase
        .from("price_lists")
        .select("id, name, description, position")
        .eq("organization_id", organizationId)
        .order("position")
        .order("name"),
      supabase
        .from("productos")
        .select("id, name, price_cop, category_id")
        .eq("organization_id", organizationId)
        .order("name"),
      supabase
        .from("producto_categorias")
        .select("id, parent_id, label")
        .eq("organization_id", organizationId),
      supabase
        .from("price_list_items")
        .select("price_list_id, producto_id, price_cop")
        .eq("organization_id", organizationId),
    ]);

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

  const overridesByProducto = new Map<string, Record<string, number>>();
  for (const it of items ?? []) {
    const m = overridesByProducto.get(it.producto_id as string) ?? {};
    m[it.price_list_id as string] = Number(it.price_cop);
    overridesByProducto.set(it.producto_id as string, m);
  }

  return {
    lists: (lists ?? []).map((l) => ({
      id: l.id as string,
      name: l.name as string,
      description: (l.description as string | null) ?? null,
    })),
    productos: (productos ?? []).map((p) => ({
      producto_id: p.id as string,
      name: p.name as string,
      category_label: labelFor(p.category_id as string | null),
      base: p.price_cop as number,
      overrides: overridesByProducto.get(p.id as string) ?? {},
    })),
  };
}
