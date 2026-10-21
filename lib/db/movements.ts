import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MovimientoRow } from "@/lib/movimientos";

const COLS = "id, type, delta, balance_after, unit_cost_cop, note, created_at, ingrediente_id, compra_id, ingredientes(name), profiles(full_name), ordenes(folio), compras(folio)";

export interface MovimientosFiltro {
  limit?: number;
  /** Only this item's movements. */
  ingredienteId?: string;
  /** ISO timestamps (inclusive start, exclusive end). */
  desde?: string;
  hasta?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toRow(m: any): MovimientoRow {
  const one = <T,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as T | null;
  return {
    id: m.id as string,
    created_at: m.created_at as string,
    type: m.type as MovimientoRow["type"],
    ingrediente_id: m.ingrediente_id as string,
    ingrediente_name: (one<{ name: string }>(m.ingredientes)?.name ?? "—") as string,
    delta: Number(m.delta),
    balance_after: Number(m.balance_after),
    unit_cost_cop: m.unit_cost_cop == null ? null : Number(m.unit_cost_cop),
    note: (m.note as string | null) ?? null,
    by_name: one<{ full_name: string | null }>(m.profiles)?.full_name ?? null,
    orden_folio: one<{ folio: string | null }>(m.ordenes)?.folio ?? null,
    compra_folio: (() => {
      const f = one<{ folio: number | null }>(m.compras)?.folio;
      return f == null ? null : Number(f);
    })(),
  };
}

/**
 * Stock movements (audit log) for the Movimientos view — reads the existing
 * `ingrediente_movements` table (written by the inventario stock flows), newest
 * first, hydrated with the ingrediente name, the author's display name and the
 * folio of the order / purchase behind the movement.
 */
export async function getMovimientos(
  organizationId: string,
  { limit = 200, ingredienteId, desde, hasta }: MovimientosFiltro = {},
): Promise<MovimientoRow[]> {
  const supabase = await createSupabaseServerClient();
  let q = supabase.from("ingrediente_movements").select(COLS).eq("organization_id", organizationId);
  if (ingredienteId) q = q.eq("ingrediente_id", ingredienteId);
  if (desde) q = q.gte("created_at", desde);
  if (hasta) q = q.lt("created_at", hasta);
  const { data } = await q.order("created_at", { ascending: false }).limit(limit);
  return (data ?? []).map(toRow);
}

export interface KardexItem {
  id: string;
  name: string;
  unit: string;
  cost_cop: number;
  stock_current: number;
  pack_label: string | null;
  pieza_qty: number | null;
  categoria: string | null;
}

export interface KardexData {
  item: KardexItem;
  /** Saldo right before `desde`: the last balance stamped before the period, else 0. */
  saldoInicial: number;
  /** Movements inside [desde, hasta), oldest first. */
  movimientos: MovimientoRow[];
  /** True when the period holds more movements than were fetched. */
  truncado: boolean;
}

const KARDEX_MAX = 2000;

/** Everything the kardex page needs for one item over a period. Null when the item isn't the org's. */
export async function getKardex(organizationId: string, ingredienteId: string, desde: string, hasta: string): Promise<KardexData | null> {
  const supabase = await createSupabaseServerClient();
  const [{ data: ing }, { data: prev }, { data: movs }] = await Promise.all([
    supabase
      .from("ingredientes")
      .select("id, name, unit, cost_cop, stock_current, pack_label, pieza_qty, ingrediente_categorias(label)")
      .eq("organization_id", organizationId)
      .eq("id", ingredienteId)
      .maybeSingle(),
    supabase
      .from("ingrediente_movements")
      .select("balance_after")
      .eq("organization_id", organizationId)
      .eq("ingrediente_id", ingredienteId)
      .lt("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("ingrediente_movements")
      .select(COLS)
      .eq("organization_id", organizationId)
      .eq("ingrediente_id", ingredienteId)
      .gte("created_at", desde)
      .lt("created_at", hasta)
      .order("created_at", { ascending: true })
      .limit(KARDEX_MAX + 1),
  ]);
  if (!ing) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cat = (ing as any).ingrediente_categorias as { label: string } | { label: string }[] | null;
  const rows = (movs ?? []).map(toRow);
  return {
    item: {
      id: ing.id as string,
      name: ing.name as string,
      unit: ing.unit as string,
      cost_cop: Number(ing.cost_cop ?? 0),
      stock_current: Number(ing.stock_current ?? 0),
      pack_label: (ing.pack_label as string | null) ?? null,
      pieza_qty: ing.pieza_qty == null ? null : Number(ing.pieza_qty),
      categoria: (Array.isArray(cat) ? cat[0]?.label : cat?.label) ?? null,
    },
    saldoInicial: prev ? Number(prev.balance_after) : 0,
    movimientos: rows.slice(0, KARDEX_MAX),
    truncado: rows.length > KARDEX_MAX,
  };
}
