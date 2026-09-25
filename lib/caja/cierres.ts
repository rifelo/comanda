import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { CajaCierre, CajaDenominacion } from "@/lib/types";
import {
  DENOMINACIONES_COP,
  diferenciaCaja,
  entregaCaja,
  esperadoCaja,
  resumenPagos,
  totalContado,
  ventanaTurno,
  type ResumenPagos,
} from "./arqueo";
import { planBase, type PlanBase } from "./base";

// DB helpers for cash closes (caja_cierres, 0037). Same shape as
// lib/inventario/conteos.ts: they take either the RLS client (admin panel)
// or the service-role client (tablet).

const SELECT =
  "id, organization_id, restaurant_id, shift_instance_id, status, counted_by, submitted_at, reviewed_by, reviewed_at, note, review_note, ventana_desde, ventana_hasta, base_inicial_cop, efectivo_cop, tarjeta_cop, transferencia_cop, pagos_count, esperado_cop, contado_cop, diferencia_cop, base_dejada_cop, denominaciones, base_denominaciones, base_exacta, base_confirmada_at, base_validada_at, base_validada_ok, base_validada_nota, base_encontrada_cop, counter:profiles!caja_cierres_counted_by_fkey(full_name), confirmer:profiles!caja_cierres_base_confirmada_by_fkey(full_name), validator:profiles!caja_cierres_base_validada_by_fkey(full_name), shift:shift_instances(date, template:checklist_templates(name))";

function mapLineas(v: unknown): CajaDenominacion[] {
  const arr = (Array.isArray(v) ? v : []) as Array<Record<string, unknown>>;
  return arr
    .map((d): CajaDenominacion => ({ valor: Number(d.valor), cantidad: Number(d.cantidad) }))
    .filter((d) => Number.isFinite(d.valor) && Number.isFinite(d.cantidad))
    .sort((a, b) => b.valor - a.valor);
}

function mapCierre(row: Record<string, unknown>): CajaCierre {
  const counter = row.counter as { full_name: string | null } | null;
  const confirmer = row.confirmer as { full_name: string | null } | null;
  const validator = row.validator as { full_name: string | null } | null;
  const shift = row.shift as { date: string; template: { name: string } | null } | null;
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
    denominaciones: mapLineas(row.denominaciones),
    base_denominaciones: mapLineas(row.base_denominaciones),
    base_exacta: row.base_exacta !== false,
    base_confirmada_at: (row.base_confirmada_at as string | null) ?? null,
    base_confirmada_by_name: confirmer?.full_name ?? null,
    base_validada_at: (row.base_validada_at as string | null) ?? null,
    base_validada_by_name: validator?.full_name ?? null,
    base_validada_ok: (row.base_validada_ok as boolean | null) ?? null,
    base_validada_nota: (row.base_validada_nota as string | null) ?? null,
    base_encontrada_cop: row.base_encontrada_cop == null ? null : Number(row.base_encontrada_cop),
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

export interface BaseSugerida {
  /** What the last live cierre of the sede left for the next day (0 when none). */
  monto: number;
  /** Shift date of that cierre (YYYY-MM-DD), null when there is none. */
  fecha: string | null;
  turno: string | null;
  counted_by_name: string | null;
  /** The cierre itself (its plan de base, confirmation and validation), null when none. */
  cierre: CajaCierre | null;
}

/**
 * The float the last live cierre of this sede left for the next day: it
 * pre-fills "base inicial" so the chain base dejada → base inicial never
 * depends on memory. Rejected closes do not count.
 */
export async function baseSugerida(db: Db, restaurantId: string): Promise<BaseSugerida> {
  const { data } = await db
    .from("caja_cierres")
    .select(SELECT)
    .eq("restaurant_id", restaurantId)
    .neq("status", "rechazado")
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return { monto: 0, fecha: null, turno: null, counted_by_name: null, cierre: null };
  const c = mapCierre(data as unknown as Record<string, unknown>);
  return {
    monto: c.base_dejada_cop,
    fecha: c.shift_date ?? c.submitted_at.slice(0, 10),
    turno: c.shift_name,
    counted_by_name: c.counted_by_name,
    cierre: c,
  };
}

/** Recent cierres of one sede, newest first (the "historial de base" on the tablet). */
export async function listCierresSede(db: Db, restaurantId: string, limit = 14): Promise<CajaCierre[]> {
  const { data, error } = await db
    .from("caja_cierres")
    .select(SELECT)
    .eq("restaurant_id", restaurantId)
    .order("submitted_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[listCierresSede]", error);
    return [];
  }
  return (data ?? []).map((r) => mapCierre(r as unknown as Record<string, unknown>));
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

// ---------------------------------------------------------------------------
// Creating a cierre (shared by the tablet and the staff shift screen)
// ---------------------------------------------------------------------------

const VALID = new Set<number>(DENOMINACIONES_COP);

export const CierreInputSchema = z.object({
  shiftInstanceId: z.string().uuid(),
  denominaciones: z
    .array(z.object({ valor: z.number().int().positive(), cantidad: z.number().int().min(0).max(100_000) }))
    .max(20)
    .refine((list) => list.every((d) => VALID.has(d.valor)), "denominación desconocida"),
  baseInicial: z.number().int().min(0).max(50_000_000),
  baseDejada: z.number().int().min(0).max(50_000_000),
  note: z.string().trim().max(300).optional(),
});
export type CierreInput = z.infer<typeof CierreInputSchema>;

export type EnviarCierreResult =
  | {
      ok: true;
      cierreId: string;
      contado: number;
      esperado: number;
      diferencia: number;
      baseInicial: number;
      baseDejada: number;
      entrega: number;
      pagos: ResumenPagos;
      ventana: { desde: string; hasta: string };
      /** Plan de base: which pieces stay in the drawer (lib/caja/base.ts). */
      plan: PlanBase;
      /** YYYY-MM-DD of the turno, for revalidating /hoy/[date]. */
      shiftDate: string;
    }
  | { ok: false; error: string };

export interface CierreActor {
  orgId: string;
  restaurantId: string;
  tz: string;
  /** profiles.id of whoever counted. */
  countedBy: string;
}

/**
 * Store a cash count, signed by `actor.countedBy`. Blind on screen: the
 * expected cash is computed HERE, from the POS payments inside the turno's
 * window, and stored on the row so the owner sees exactly which sales were
 * compared. `db` is the service-role client (the tablet) or an RLS client
 * that can already see the instance; the instance must belong to the sede.
 *
 * Window: the instance's `date` is a wall-clock day in the sede's timezone
 * and `inicio` a time on that day. It runs from `opened_at` (the first tick)
 * or the scheduled start when nobody ticked anything, until `closed_at` or
 * now. The helper never inverts the window.
 */
export async function crearCierre(db: Db, actor: CierreActor, data: CierreInput): Promise<EnviarCierreResult> {
  const { data: inst } = await db
    .from("shift_instances")
    .select("id, date, opened_at, closed_at, template:checklist_templates!inner(inicio)")
    .eq("id", data.shiftInstanceId)
    .eq("restaurant_id", actor.restaurantId)
    .maybeSingle();
  if (!inst) return { ok: false, error: "Turno no encontrado." };

  const { data: live } = await db
    .from("caja_cierres")
    .select("id")
    .eq("shift_instance_id", inst.id)
    .neq("status", "rechazado")
    .limit(1)
    .maybeSingle();
  if (live) return { ok: false, error: "Ya hay un cierre de caja para este turno." };

  const template = inst.template as unknown as { inicio: string };
  const ventana = ventanaTurno({
    date: inst.date as string,
    inicio: template.inicio,
    tz: actor.tz,
    opened_at: (inst.opened_at as string | null) ?? null,
    closed_at: (inst.closed_at as string | null) ?? null,
  });
  const pagos = await sumPagosVentana(db, {
    orgId: actor.orgId,
    restaurantId: actor.restaurantId,
    desde: ventana.desde,
    hasta: ventana.hasta,
  });

  const denominaciones = data.denominaciones.filter((d) => d.cantidad > 0).sort((a, b) => b.valor - a.valor);
  const contado = totalContado(denominaciones);
  const esperado = esperadoCaja(data.baseInicial, pagos.efectivo);
  const diferencia = diferenciaCaja(contado, esperado);
  const plan = planBase(denominaciones, data.baseDejada);

  const { data: row, error } = await db
    .from("caja_cierres")
    .insert({
      organization_id: actor.orgId,
      restaurant_id: actor.restaurantId,
      shift_instance_id: inst.id,
      counted_by: actor.countedBy,
      note: data.note || null,
      ventana_desde: ventana.desde,
      ventana_hasta: ventana.hasta,
      base_inicial_cop: data.baseInicial,
      efectivo_cop: pagos.efectivo,
      tarjeta_cop: pagos.tarjeta,
      transferencia_cop: pagos.transferencia,
      pagos_count: pagos.count,
      esperado_cop: esperado,
      contado_cop: contado,
      diferencia_cop: diferencia,
      base_dejada_cop: data.baseDejada,
      denominaciones,
      base_denominaciones: plan.lineas,
      base_exacta: plan.exacto,
    })
    .select("id")
    .single();
  if (error || !row) {
    // 23505 = the partial unique index: someone sent one a moment ago.
    if (error?.code === "23505") return { ok: false, error: "Ya hay un cierre de caja para este turno." };
    console.error("[crearCierre] insert:", error);
    return { ok: false, error: "No se pudo guardar el cierre." };
  }
  return {
    ok: true,
    cierreId: row.id as string,
    contado,
    esperado,
    diferencia,
    baseInicial: data.baseInicial,
    baseDejada: data.baseDejada,
    entrega: entregaCaja(contado, data.baseDejada),
    pagos,
    ventana,
    plan,
    shiftDate: inst.date as string,
  };
}

// ---------------------------------------------------------------------------
// Plan de base: confirmation (who closes) and validation (who opens next)
// ---------------------------------------------------------------------------

export type BaseActionResult = { ok: true } | { ok: false; error: string };

/** Whoever closed confirms the planned pieces were set aside in the drawer. */
export async function confirmarBase(db: Db, scope: { restaurantId: string; by: string }, cierreId: string): Promise<BaseActionResult> {
  const { data, error } = await db
    .from("caja_cierres")
    .update({ base_confirmada_at: new Date().toISOString(), base_confirmada_by: scope.by })
    .eq("id", cierreId)
    .eq("restaurant_id", scope.restaurantId)
    .neq("status", "rechazado")
    .is("base_confirmada_at", null)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Esta base ya estaba confirmada." };
  return { ok: true };
}

export interface ValidarBaseInput {
  cierreId: string;
  ok: boolean;
  /** What was actually found when it does not match (COP). */
  encontrado?: number;
  nota?: string;
}

/** Whoever opens the next turno records whether the base was found as planned. */
export async function validarBase(db: Db, scope: { restaurantId: string; by: string }, input: ValidarBaseInput): Promise<BaseActionResult> {
  const { data, error } = await db
    .from("caja_cierres")
    .update({
      base_validada_at: new Date().toISOString(),
      base_validada_by: scope.by,
      base_validada_ok: input.ok,
      base_validada_nota: input.nota?.trim() || null,
      base_encontrada_cop: input.ok ? null : (input.encontrado ?? null),
    })
    .eq("id", input.cierreId)
    .eq("restaurant_id", scope.restaurantId)
    .neq("status", "rechazado")
    .is("base_validada_at", null)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Esta base ya fue validada." };
  return { ok: true };
}
