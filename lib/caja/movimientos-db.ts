import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MotivoCaja, TipoMovimiento } from "./movimientos";

// Cash movements (caja_movimientos, 0054). Like lib/caja/cierres.ts, these
// take the RLS client (owner panel) or the service-role client (tablet).

export interface CajaMovimiento {
  id: string;
  tipo: TipoMovimiento;
  monto: number;
  motivo: MotivoCaja;
  justificacion: string;
  compraId: string | null;
  compraFolio: number | null;
  createdAt: string;
  by: string | null;
}

const COLS = "id, tipo, monto_cop, motivo, justificacion, compra_id, created_at, compra:compras!caja_movimientos_compra_id_fkey(folio), quien:profiles!caja_movimientos_registered_by_fkey(full_name)";

/** Movements of a sede (or the whole org) since `desde`, newest first. */
export async function listMovimientos(db: SupabaseClient, scope: { orgId: string; restaurantId?: string }, desde: string, limit = 200): Promise<CajaMovimiento[]> {
  let q = db.from("caja_movimientos").select(COLS).eq("organization_id", scope.orgId).gte("created_at", desde);
  if (scope.restaurantId) q = q.eq("restaurant_id", scope.restaurantId);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(limit);
  if (error) {
    console.error("[listMovimientos]", error);
    return [];
  }
  return (data ?? []).map((r) => {
    const one = <T,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as T | null;
    return {
      id: r.id as string,
      tipo: r.tipo as TipoMovimiento,
      monto: Number(r.monto_cop),
      motivo: r.motivo as MotivoCaja,
      justificacion: r.justificacion as string,
      compraId: (r.compra_id as string | null) ?? null,
      compraFolio: one<{ folio: number }>(r.compra)?.folio ?? null,
      createdAt: r.created_at as string,
      by: one<{ full_name: string | null }>(r.quien)?.full_name ?? null,
    };
  });
}

/** Ingresos and salidas of a sede inside a window — what the arqueo adds to and takes from the expected cash. */
export async function sumMovimientosVentana(db: SupabaseClient, input: { orgId: string; restaurantId: string; desde: string; hasta: string }): Promise<{ ingresos: number; salidas: number }> {
  const { data, error } = await db
    .from("caja_movimientos")
    .select("tipo, monto_cop")
    .eq("organization_id", input.orgId)
    .eq("restaurant_id", input.restaurantId)
    .gte("created_at", input.desde)
    .lt("created_at", input.hasta);
  if (error) {
    console.error("[sumMovimientosVentana]", error);
    return { ingresos: 0, salidas: 0 };
  }
  let ingresos = 0;
  let salidas = 0;
  for (const r of data ?? []) {
    if (r.tipo === "ingreso") ingresos += Number(r.monto_cop);
    else salidas += Number(r.monto_cop);
  }
  return { ingresos, salidas };
}

/** The open shift instance of a sede today, if any (the movement belongs to it). */
export async function turnoAbierto(db: SupabaseClient, restaurantId: string, today: string): Promise<string | null> {
  const { data } = await db
    .from("shift_instances")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("date", today)
    .eq("status", "open")
    .order("opened_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/** Store one movement. The caller has validated it (errorMovimiento). */
export async function crearMovimiento(
  db: SupabaseClient,
  m: { orgId: string; restaurantId: string; shiftInstanceId: string | null; tipo: TipoMovimiento; monto: number; motivo: MotivoCaja; justificacion: string; compraId?: string | null; by: string },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data, error } = await db
    .from("caja_movimientos")
    .insert({
      organization_id: m.orgId,
      restaurant_id: m.restaurantId,
      shift_instance_id: m.shiftInstanceId,
      tipo: m.tipo,
      monto_cop: m.monto,
      motivo: m.motivo,
      justificacion: m.justificacion.trim(),
      compra_id: m.compraId ?? null,
      registered_by: m.by,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[crearMovimiento]", error);
    return { ok: false, error: "No se pudo guardar el movimiento de caja." };
  }
  return { ok: true, id: data.id as string };
}
