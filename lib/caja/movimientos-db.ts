import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DetalleMovimiento, MotivoCaja, TipoMovimiento } from "./movimientos";

// Cash movements (caja_movimientos, 0054 + 0062). Like lib/caja/cierres.ts,
// these take the RLS client (owner panel) or the service-role client (tablet).

export const CAJA_FOTOS = "caja-fotos";

export interface CajaMovimiento {
  id: string;
  tipo: TipoMovimiento;
  monto: number;
  motivo: MotivoCaja;
  justificacion: string;
  detalle: DetalleMovimiento;
  fotoPath: string | null;
  compraId: string | null;
  compraFolio: number | null;
  compraProveedor: string | null;
  /** The linked order already has its invoice photo (taken at reception). */
  compraConFactura: boolean;
  clientRef: string | null;
  createdAt: string;
  by: string | null;
  anuladoAt: string | null;
  anuladoBy: string | null;
  anuladoMotivo: string | null;
}

const COLS =
  "id, tipo, monto_cop, motivo, justificacion, detalle, foto_path, client_ref, compra_id, created_at, anulado_at, anulado_motivo, compra:compras!caja_movimientos_compra_id_fkey(folio, factura_foto_path, proveedor:proveedores(name)), quien:profiles!caja_movimientos_registered_by_fkey(full_name), anulador:profiles!caja_movimientos_anulado_by_fkey(full_name)";

const one = <T,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as T | null;

function mapMovimiento(r: Record<string, unknown>): CajaMovimiento {
  const compra = one<{ folio: number; factura_foto_path: string | null; proveedor: unknown }>(r.compra);
  return {
    id: r.id as string,
    tipo: r.tipo as TipoMovimiento,
    monto: Number(r.monto_cop),
    motivo: r.motivo as MotivoCaja,
    justificacion: r.justificacion as string,
    detalle: (r.detalle as DetalleMovimiento | null) ?? {},
    fotoPath: (r.foto_path as string | null) ?? null,
    compraId: (r.compra_id as string | null) ?? null,
    compraFolio: compra?.folio ?? null,
    compraProveedor: one<{ name: string }>(compra?.proveedor)?.name ?? null,
    compraConFactura: !!compra?.factura_foto_path,
    clientRef: (r.client_ref as string | null) ?? null,
    createdAt: r.created_at as string,
    by: one<{ full_name: string | null }>(r.quien)?.full_name ?? null,
    anuladoAt: (r.anulado_at as string | null) ?? null,
    anuladoBy: one<{ full_name: string | null }>(r.anulador)?.full_name ?? null,
    anuladoMotivo: (r.anulado_motivo as string | null) ?? null,
  };
}

/** Movements of a sede (or the whole org) since `desde`, newest first; voided ones included. */
export async function listMovimientos(db: SupabaseClient, scope: { orgId: string; restaurantId?: string }, desde: string, limit = 200): Promise<CajaMovimiento[]> {
  let q = db.from("caja_movimientos").select(COLS).eq("organization_id", scope.orgId).gte("created_at", desde);
  if (scope.restaurantId) q = q.eq("restaurant_id", scope.restaurantId);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(limit);
  if (error) {
    console.error("[listMovimientos]", error);
    return [];
  }
  return (data ?? []).map((r) => mapMovimiento(r as unknown as Record<string, unknown>));
}

/** Ingresos and salidas of a sede inside a window — what the arqueo adds to and takes from the expected cash. Voided ones don't count. */
export async function sumMovimientosVentana(db: SupabaseClient, input: { orgId: string; restaurantId: string; desde: string; hasta: string }): Promise<{ ingresos: number; salidas: number }> {
  const { data, error } = await db
    .from("caja_movimientos")
    .select("tipo, monto_cop")
    .eq("organization_id", input.orgId)
    .eq("restaurant_id", input.restaurantId)
    .is("anulado_at", null)
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

/**
 * Store one movement. The caller has validated it (errorMovimiento). With a
 * `clientRef` a retry of the same tap (the tablet resending its offline
 * queue) returns the row already stored instead of a duplicate.
 */
export async function crearMovimiento(
  db: SupabaseClient,
  m: {
    orgId: string;
    restaurantId: string;
    shiftInstanceId: string | null;
    tipo: TipoMovimiento;
    monto: number;
    motivo: MotivoCaja;
    justificacion: string;
    compraId?: string | null;
    by: string;
    detalle?: DetalleMovimiento;
    fotoPath?: string | null;
    clientRef?: string | null;
    /** When the tap happened (offline taps keep their own time). */
    createdAt?: string;
  },
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
      detalle: m.detalle ?? {},
      foto_path: m.fotoPath ?? null,
      client_ref: m.clientRef ?? null,
      ...(m.createdAt ? { created_at: m.createdAt } : {}),
    })
    .select("id")
    .single();
  if (error?.code === "23505" && m.clientRef) {
    const { data: prev } = await db.from("caja_movimientos").select("id").eq("organization_id", m.orgId).eq("client_ref", m.clientRef).maybeSingle();
    if (prev) return { ok: true, id: prev.id as string };
  }
  if (error || !data) {
    console.error("[crearMovimiento]", error);
    return { ok: false, error: "No se pudo guardar el movimiento de caja." };
  }
  return { ok: true, id: data.id as string };
}

/** Received orders of the org still owed to the supplier — what «Pago a proveedor» offers to pay from the drawer. */
export interface CompraPorPagar {
  id: string;
  folio: number;
  proveedor: string | null;
  total: number | null;
  recibidoAt: string | null;
  conFactura: boolean;
}

export async function comprasPorPagar(db: SupabaseClient, orgId: string, limit = 20): Promise<CompraPorPagar[]> {
  const { data, error } = await db
    .from("compras")
    .select("id, folio, factura_total_cop, total_cop, recibido_at, factura_foto_path, proveedor:proveedores(name)")
    .eq("organization_id", orgId)
    .in("status", ["recibido", "cerrada"])
    .eq("pago_metodo", "pendiente")
    .is("caja_movimiento_id", null)
    .order("recibido_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) {
    console.error("[comprasPorPagar]", error);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id as string,
    folio: Number(r.folio),
    proveedor: one<{ name: string }>(r.proveedor)?.name ?? null,
    total: r.factura_total_cop != null ? Number(r.factura_total_cop) : r.total_cop != null ? Math.round(Number(r.total_cop)) : null,
    recibidoAt: (r.recibido_at as string | null) ?? null,
    conFactura: !!r.factura_foto_path,
  }));
}

/** Tie a cash payment to the order it paid: the order stops being owed. */
export async function marcarCompraPagada(db: SupabaseClient, orgId: string, compraId: string, movimientoId: string): Promise<void> {
  const { error } = await db
    .from("compras")
    .update({ pago_metodo: "efectivo_caja", caja_movimiento_id: movimientoId })
    .eq("organization_id", orgId)
    .eq("id", compraId)
    .is("caja_movimiento_id", null);
  if (error) console.error("[marcarCompraPagada]", error);
}

/**
 * A movement can be voided or changed while no live arqueo has counted it
 * yet: once a cierre covers its time, the count compared against it stands.
 */
async function yaContado(db: SupabaseClient, restaurantId: string, createdAt: string): Promise<boolean> {
  const { data } = await db
    .from("caja_cierres")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .neq("status", "rechazado")
    .lte("ventana_desde", createdAt)
    .gt("ventana_hasta", createdAt)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

/** Void a movement (never deleted): the arqueo stops counting it; a voided supplier payment leaves the order owed again. */
export async function anularMovimiento(db: SupabaseClient, scope: { orgId: string; restaurantId: string; by: string }, id: string, motivo: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: m } = await db.from("caja_movimientos").select("id, created_at, compra_id, anulado_at").eq("organization_id", scope.orgId).eq("restaurant_id", scope.restaurantId).eq("id", id).maybeSingle();
  if (!m) return { ok: false, error: "Ese movimiento no existe." };
  if (m.anulado_at) return { ok: false, error: "Ya estaba anulado." };
  if (await yaContado(db, scope.restaurantId, m.created_at as string)) return { ok: false, error: "Ya entró en un arqueo enviado: no se puede anular. Avísale al dueño." };
  const { error } = await db
    .from("caja_movimientos")
    .update({ anulado_at: new Date().toISOString(), anulado_by: scope.by, anulado_motivo: motivo.trim() })
    .eq("id", id)
    .is("anulado_at", null);
  if (error) {
    console.error("[anularMovimiento]", error);
    return { ok: false, error: "No se pudo anular." };
  }
  if (m.compra_id) {
    await db.from("compras").update({ pago_metodo: "pendiente", caja_movimiento_id: null }).eq("id", m.compra_id as string).eq("caja_movimiento_id", id);
  }
  return { ok: true };
}

/** Attach (or replace) the photo of a movement: the receipt of a consignación, the invoice of a payment. */
export async function adjuntarFoto(db: SupabaseClient, scope: { orgId: string; restaurantId: string }, id: string, path: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await db
    .from("caja_movimientos")
    .update({ foto_path: path })
    .eq("organization_id", scope.orgId)
    .eq("restaurant_id", scope.restaurantId)
    .eq("id", id)
    .is("anulado_at", null)
    .select("id");
  if (error) {
    console.error("[adjuntarFoto]", error);
    return { ok: false, error: "No se pudo guardar la foto." };
  }
  if (!data?.length) return { ok: false, error: "Ese movimiento ya no se puede cambiar." };
  return { ok: true };
}

/** A short-lived link to look at a photo (the bucket is private). */
export async function urlFoto(db: SupabaseClient, bucket: string, path: string): Promise<string | null> {
  const { data } = await db.storage.from(bucket).createSignedUrl(path, 60 * 10);
  return data?.signedUrl ?? null;
}
