import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Ingrediente, IngredienteCategoria, Proveedor } from "@/lib/types";

export interface IngredientesView {
  categorias: IngredienteCategoria[];
  ingredientes: Ingrediente[];
}

export async function getIngredientesView(
  organizationId: string,
): Promise<IngredientesView> {
  const supabase = await createSupabaseServerClient();
  const [cats, ings] = await Promise.all([
    supabase
      .from("ingrediente_categorias")
      .select("id, organization_id, parent_id, label, position")
      .eq("organization_id", organizationId)
      .order("position")
      .order("label"),
    supabase
      .from("ingredientes")
      .select(
        "id, organization_id, category_id, name, unit, unit2, conversion_factor, stock_current, stock_min, merma_pct, cost_cop, pack_cost_cop, pack_qty, archived, conteo_diario, prioridad, stock_critico, stock_objetivo, ubicacion, pack_label, pieza_qty, proveedor_id, controla_vencimiento, rotacion, rotacion_auto, rotacion_dias, rotacion_ventana, dias_seguridad",
      )
      .eq("organization_id", organizationId)
      .eq("archived", false)
      .order("name"),
  ]);
  return {
    categorias: (cats.data ?? []) as IngredienteCategoria[],
    ingredientes: (ings.data ?? []) as Ingrediente[],
  };
}

/** The org's suppliers, active ones only, by name. */
export async function listProveedores(organizationId: string): Promise<Proveedor[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("proveedores")
    .select("id, organization_id, name, whatsapp, dias_pedido, notas, archived")
    .eq("organization_id", organizationId)
    .eq("archived", false)
    .order("name");
  return (data ?? []) as Proveedor[];
}

const ING_COLS =
  "id, organization_id, category_id, name, unit, unit2, conversion_factor, stock_current, stock_min, merma_pct, cost_cop, pack_cost_cop, pack_qty, archived, conteo_diario, prioridad, stock_critico, stock_objetivo, ubicacion, pack_label, pieza_qty, proveedor_id, controla_vencimiento, rotacion, rotacion_auto, rotacion_dias, rotacion_ventana, dias_seguridad";

/** What /inventario/[id] shows around the kardex: the item, where it's used, its supplier and sales since it was last counted. */
export interface InsumoContexto {
  item: Ingrediente;
  proveedor: string | null;
  categoria: string | null;
  /** Recipes using it, best sellers (last 30 days) first. */
  recetas: { producto_id: string; name: string; sku: string; qty: number; unit: string; vendidas30: number }[];
  /** Modifier options that also take it out («Base en leche»). */
  opciones: number;
  /** Last time it was counted (approved count or a «Conteo» fix), ISO, or null. */
  ultimoConteo: string | null;
  /** What sales took out since then (positive, in the item's unit). */
  ventasDesdeConteo: number;
}

export async function getInsumoContexto(organizationId: string, ingredienteId: string): Promise<InsumoContexto | null> {
  const supabase = await createSupabaseServerClient();
  const desde30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [{ data: ing }, { data: recetas }, { count: opciones }, { data: conteoItems }, { data: ajuste }] = await Promise.all([
    supabase.from("ingredientes").select(ING_COLS).eq("organization_id", organizationId).eq("id", ingredienteId).maybeSingle(),
    supabase.from("receta_items").select("producto_id, qty, unit, productos(name, sku)").eq("organization_id", organizationId).eq("ingrediente_id", ingredienteId),
    supabase.from("modifier_option_receta").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("ingrediente_id", ingredienteId),
    supabase.from("inventario_conteo_items").select("conteo:inventario_conteos!inner(submitted_at, status)").eq("ingrediente_id", ingredienteId).eq("conteo.status", "aprobado").limit(200),
    supabase
      .from("ingrediente_movements")
      .select("created_at")
      .eq("organization_id", organizationId)
      .eq("ingrediente_id", ingredienteId)
      .eq("type", "ajuste")
      .ilike("note", "Conteo%")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  if (!ing) return null;
  const item = ing as Ingrediente;

  const one = <T,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as T | null;
  let ultimoConteo: string | null = (ajuste?.[0]?.created_at as string | undefined) ?? null;
  for (const c of conteoItems ?? []) {
    const at = one<{ submitted_at: string }>(c.conteo)?.submitted_at ?? null;
    if (at && (!ultimoConteo || at > ultimoConteo)) ultimoConteo = at;
  }

  const productoIds = (recetas ?? []).map((r) => r.producto_id as string);
  const [{ data: prov }, { data: cat }, { data: ventas }, { data: vendidas }] = await Promise.all([
    item.proveedor_id ? supabase.from("proveedores").select("name").eq("id", item.proveedor_id).maybeSingle() : Promise.resolve({ data: null }),
    item.category_id ? supabase.from("ingrediente_categorias").select("label").eq("id", item.category_id).maybeSingle() : Promise.resolve({ data: null }),
    ultimoConteo
      ? todas<{ delta: number }>((from, to) => supabase.from("ingrediente_movements").select("delta").eq("organization_id", organizationId).eq("ingrediente_id", ingredienteId).eq("type", "venta").gte("created_at", ultimoConteo!).order("created_at").range(from, to))
      : Promise.resolve({ data: [] as { delta: number }[] }),
    productoIds.length ? vendidasPorProducto(organizationId, desde30, productoIds) : Promise.resolve({ data: [] as { producto_id: string; qty: number }[] }),
  ]);
  const porProducto = new Map<string, number>();
  for (const v of vendidas ?? []) porProducto.set(v.producto_id as string, (porProducto.get(v.producto_id as string) ?? 0) + Number(v.qty ?? 0));

  return {
    item,
    proveedor: (prov as { name: string } | null)?.name ?? null,
    categoria: (cat as { label: string } | null)?.label ?? null,
    recetas: (recetas ?? [])
      .map((r) => {
        const p = one<{ name: string; sku: string }>(r.productos);
        return { producto_id: r.producto_id as string, name: p?.name ?? "—", sku: p?.sku ?? "", qty: Number(r.qty), unit: r.unit as string, vendidas30: porProducto.get(r.producto_id as string) ?? 0 };
      })
      .sort((a, b) => b.vendidas30 - a.vendidas30 || a.name.localeCompare(b.name, "es")),
    opciones: opciones ?? 0,
    ultimoConteo,
    ventasDesdeConteo: Math.round(-(ventas ?? []).reduce((n, v) => n + Number(v.delta ?? 0), 0) * 1000) / 1000,
  };
}

/** Pending review items for the owner's «Por revisar»: open team suggestions and recent mermas. */
export async function getPorRevisarExtra(organizationId: string, desdeMermas: string): Promise<{
  sugerencias: { id: string; tipo: "ubicacion" | "nuevo"; zona: string; nombre: string; quien: string | null }[];
  mermas: { id: string; nombre: string; qty: number; unidad: string; costo: number; motivo: string; reportedAt: string; quien: string | null }[];
}> {
  const supabase = await createSupabaseServerClient();
  const one = <T,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as T | null;
  const [{ data: sug }, { data: mer }] = await Promise.all([
    supabase
      .from("inventario_sugerencias")
      .select("id, tipo, zona, nombre, ingrediente:ingredientes!inventario_sugerencias_ingrediente_id_fkey(name), quien:profiles!inventario_sugerencias_sugerido_por_fkey(full_name)")
      .eq("organization_id", organizationId)
      .eq("status", "pendiente")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("inventario_mermas")
      .select("id, nombre, qty, unidad, costo_cop, motivo, reported_at, reporter:profiles!inventario_mermas_reported_by_fkey(full_name)")
      .eq("organization_id", organizationId)
      .gte("reported_at", desdeMermas)
      .order("reported_at", { ascending: false })
      .limit(5),
  ]);
  return {
    sugerencias: (sug ?? []).map((s) => ({
      id: s.id as string,
      tipo: s.tipo as "ubicacion" | "nuevo",
      zona: s.zona as string,
      nombre: (s.nombre as string | null) ?? one<{ name: string }>(s.ingrediente)?.name ?? "—",
      quien: one<{ full_name: string | null }>(s.quien)?.full_name ?? null,
    })),
    mermas: (mer ?? []).map((m) => ({
      id: m.id as string,
      nombre: m.nombre as string,
      qty: Number(m.qty),
      unidad: m.unidad as string,
      costo: Number(m.costo_cop ?? 0),
      motivo: m.motivo as string,
      reportedAt: m.reported_at as string,
      quien: one<{ full_name: string | null }>(m.reporter)?.full_name ?? null,
    })),
  };
}

/**
 * Reads every row of a query in pages of 1.000 (Supabase caps a response at
 * 1.000 rows; a month of sales is more). `page(from, to)` builds the query.
 */
async function todas<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null }>, max = 50_000): Promise<{ data: T[] }> {
  const out: T[] = [];
  for (let from = 0; from < max; from += 1000) {
    const { data } = await page(from, from + 999);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return { data: out };
}

/** Paid units per product since `desde` (optionally only some products). */
async function vendidasPorProducto(organizationId: string, desde: string, productoIds?: string[]): Promise<{ data: { producto_id: string; qty: number }[] }> {
  const supabase = await createSupabaseServerClient();
  return todas<{ producto_id: string; qty: number }>((from, to) => {
    let q = supabase.from("orden_items").select("producto_id, qty, ordenes!inner(status, created_at)").eq("organization_id", organizationId).eq("ordenes.status", "pagada").gte("ordenes.created_at", desde);
    if (productoIds) q = q.in("producto_id", productoIds);
    return q.order("id").range(from, to);
  });
}

/**
 * For each insumo, the product that sells the most among those whose recipe
 * uses it (last 30 days) — where «Error de receta» sends the owner.
 */
export async function recetaMasVendidaPorInsumo(organizationId: string): Promise<Record<string, string>> {
  const supabase = await createSupabaseServerClient();
  const desde = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [{ data: lineas }, { data: vendidas }] = await Promise.all([
    todas<{ producto_id: string; ingrediente_id: string }>((from, to) => supabase.from("receta_items").select("producto_id, ingrediente_id").eq("organization_id", organizationId).order("id").range(from, to)),
    vendidasPorProducto(organizationId, desde),
  ]);
  const ventas = new Map<string, number>();
  for (const v of vendidas) ventas.set(v.producto_id, (ventas.get(v.producto_id) ?? 0) + Number(v.qty ?? 0));
  const best: Record<string, string> = {};
  for (const l of lineas) {
    const cur = best[l.ingrediente_id];
    if (!cur || (ventas.get(l.producto_id) ?? 0) > (ventas.get(cur) ?? 0)) best[l.ingrediente_id] = l.producto_id;
  }
  return best;
}
