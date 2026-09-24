import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CajaCierre, CajaDenominacion } from "@/lib/types";
import { resumenPagos, type ResumenPagos } from "./arqueo";

// DB helpers for cash closes (caja_cierres, 0037). Same shape as
// lib/inventario/conteos.ts: they take either the RLS client (admin panel)
// or the service-role client (tablet).

const SELECT =
  "id, organization_id, restaurant_id, shift_instance_id, status, counted_by, submitted_at, reviewed_by, reviewed_at, note, review_note, ventana_desde, ventana_hasta, base_inicial_cop, efectivo_cop, tarjeta_cop, transferencia_cop, pagos_count, esperado_cop, contado_cop, diferencia_cop, base_dejada_cop, denominaciones, counter:profiles!caja_cierres_counted_by_fkey(full_name), shift:shift_instances(date, template:checklist_templates(name))";

function mapCierre(row: Record<string, unknown>): CajaCierre {
  const counter = row.counter as { full_name: string | null } | null;
  const shift = row.shift as { date: string; template: { name: string } | null } | null;
  const denominaciones = (Array.isArray(row.denominaciones) ? row.denominaciones : []) as Array<Record<string, unknown>>;
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    restaurant_id: (row.restaurant_id as string | null) ?? null,
    shift_instance_id: (row.shift_instance_id as string | null) ?? null,
    status: row.status as CajaCierre["status"],
    counted_by: (row.counted_by as string | null) ?? null,
    counted_by_name: counter?.full_name ?? null,
    submitted_at: row.submitted_at as string,
    reviewed_by: (row.reviewed_by as string | null) ?? null,
    reviewed_at: (row.reviewed_at as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    review_note: (row.review_note as string | null) ?? null,
    ventana_desde: row.ventana_desde as string,
    ventana_hasta: row.ventana_hasta as string,
    base_inicial_cop: Number(row.base_inicial_cop ?? 0),
    efectivo_cop: Number(row.efectivo_cop ?? 0),
    tarjeta_cop: Number(row.tarjeta_cop ?? 0),
    transferencia_cop: Number(row.transferencia_cop ?? 0),
    pagos_count: Number(row.pagos_count ?? 0),
    esperado_cop: Number(row.esperado_cop ?? 0),
    contado_cop: Number(row.contado_cop ?? 0),
    diferencia_cop: Number(row.diferencia_cop ?? 0),
    base_dejada_cop: Number(row.base_dejada_cop ?? 0),
    denominaciones: denominaciones
      .map((d): CajaDenominacion => ({ valor: Number(d.valor), cantidad: Number(d.cantidad) }))
      .filter((d) => Number.isFinite(d.valor) && Number.isFinite(d.cantidad))
      .sort((a, b) => b.valor - a.valor),
    shift_date: shift?.date ?? null,
    shift_name: shift?.template?.name ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;

/** Newest first. */
export async function listCierres(db: Db, orgId: string, limit = 40): Promise<CajaCierre[]> {
  const { data, error } = await db
    .from("caja_cierres")
    .select(SELECT)
    .eq("organization_id", orgId)
    .order("submitted_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[listCierres]", error);
    return [];
  }
  return (data ?? []).map((r) => mapCierre(r as unknown as Record<string, unknown>));
}

export async function getCierre(db: Db, orgId: string, id: string): Promise<CajaCierre | null> {
  const { data } = await db.from("caja_cierres").select(SELECT).eq("organization_id", orgId).eq("id", id).maybeSingle();
  return data ? mapCierre(data as unknown as Record<string, unknown>) : null;
}

/** The live (non-rejected) cierre of a turno, else its latest rejected one, else null. */
export async function getCierreByInstance(db: Db, orgId: string, shiftInstanceId: string): Promise<CajaCierre | null> {
  const { data } = await db
    .from("caja_cierres")
    .select(SELECT)
    .eq("organization_id", orgId)
    .eq("shift_instance_id", shiftInstanceId)
    .order("submitted_at", { ascending: false });
  const rows = (data ?? []).map((r) => mapCierre(r as unknown as Record<string, unknown>));
  return rows.find((c) => c.status !== "rechazado") ?? rows[0] ?? null;
}

/** The float the last live cierre of this sede left for the next day (pre-fills "base inicial"). */
export async function lastBaseDejada(db: Db, restaurantId: string): Promise<number> {
  const { data } = await db
    .from("caja_cierres")
    .select("base_dejada_cop")
    .eq("restaurant_id", restaurantId)
    .neq("status", "rechazado")
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return Number(data?.base_dejada_cop ?? 0);
}

/**
 * POS payments of the sede inside a window, split by method. `orden_pagos`
 * has no restaurant column, so the sede comes through the order; cancelled
 * orders are left out.
 */
export async function sumPagosVentana(
  db: Db,
  input: { orgId: string; restaurantId: string; desde: string; hasta: string },
): Promise<ResumenPagos> {
  const { data, error } = await db
    .from("orden_pagos")
    .select("method, amount_cop, ordenes!inner(restaurant_id, status)")
    .eq("organization_id", input.orgId)
    .eq("ordenes.restaurant_id", input.restaurantId)
    .neq("ordenes.status", "cancelada")
    .gte("created_at", input.desde)
    .lt("created_at", input.hasta);
  if (error) {
    console.error("[sumPagosVentana]", error);
    return { efectivo: 0, tarjeta: 0, transferencia: 0, count: 0 };
  }
  return resumenPagos((data ?? []) as Array<{ method: string; amount_cop: number }>);
}

export interface CajaInstance {
  id: string;
  status: "open" | "closed";
  opened_at: string | null;
  closed_at: string | null;
  template_name: string;
  inicio: string;
  fin: string;
}

/** Today's shift instances of a sede, earliest start first, for the instance picker. */
export async function listInstancesForCaja(db: Db, restaurantId: string, date: string): Promise<CajaInstance[]> {
  const { data } = await db
    .from("shift_instances")
    .select("id, status, opened_at, closed_at, template:checklist_templates!inner(name, inicio, fin)")
    .eq("restaurant_id", restaurantId)
    .eq("date", date);
  return ((data ?? []) as Array<Record<string, unknown>>)
    .map((r) => {
      const t = r.template as { name: string; inicio: string; fin: string };
      return {
        id: r.id as string,
        status: r.status as "open" | "closed",
        opened_at: (r.opened_at as string | null) ?? null,
        closed_at: (r.closed_at as string | null) ?? null,
        template_name: t.name,
        inicio: t.inicio,
        fin: t.fin,
      };
    })
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
}
