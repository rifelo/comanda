import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FaltanteAbierto, FaltanteEstado, RapidoIngrediente } from "./faltantes";

// DB helpers for the quick inventory (inventario_faltantes, 0038). Same
// shape as lib/caja/cierres.ts: they take either the RLS client (admin
// panel) or the service-role client (tablet / shift tools).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;

/** A report row with the names the panel shows. */
export interface FaltanteReporte extends FaltanteAbierto {
  organization_id: string;
  restaurant_id: string | null;
  shift_instance_id: string | null;
  ingrediente_name: string;
  unit: string;
  stock_sistema: number | null;
  resolved_at: string | null;
  resolved_by_name: string | null;
  resolved_note: string | null;
}

const SELECT =
  "id, organization_id, restaurant_id, shift_instance_id, ingrediente_id, estado, stock_sistema, note, reported_at, resolved_at, resolved_note, ingrediente:ingredientes!inner(name, unit), reporter:profiles!inventario_faltantes_reported_by_fkey(full_name), resolver:profiles!inventario_faltantes_resolved_by_fkey(full_name)";

function mapReporte(row: Record<string, unknown>): FaltanteReporte {
  const ing = row.ingrediente as { name: string; unit: string };
  const reporter = row.reporter as { full_name: string | null } | null;
  const resolver = row.resolver as { full_name: string | null } | null;
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    restaurant_id: (row.restaurant_id as string | null) ?? null,
    shift_instance_id: (row.shift_instance_id as string | null) ?? null,
    ingrediente_id: row.ingrediente_id as string,
    ingrediente_name: ing.name,
    unit: ing.unit,
    estado: row.estado as FaltanteEstado,
    stock_sistema: row.stock_sistema == null ? null : Number(row.stock_sistema),
    note: (row.note as string | null) ?? null,
    reported_at: row.reported_at as string,
    reported_by_name: reporter?.full_name ?? null,
    resolved_at: (row.resolved_at as string | null) ?? null,
    resolved_by_name: resolver?.full_name ?? null,
    resolved_note: (row.resolved_note as string | null) ?? null,
  };
}

/** The ingredients on the quick list (prioridad > 0, not archived). */
export async function listRapido(db: Db, orgId: string): Promise<RapidoIngrediente[]> {
  const { data, error } = await db
    .from("ingredientes")
    .select("id, name, unit, prioridad, stock_current, stock_min")
    .eq("organization_id", orgId)
    .eq("archived", false)
    .gt("prioridad", 0)
    .order("prioridad")
    .order("name");
  if (error) {
    console.error("[listRapido]", error);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    unit: r.unit as string,
    prioridad: Number(r.prioridad ?? 0),
    stock_current: Number(r.stock_current ?? 0),
    stock_min: Number(r.stock_min ?? 0),
  }));
}

/** Unresolved reports (poco / se acabó), newest first. */
export async function listFaltantesAbiertos(db: Db, orgId: string): Promise<FaltanteReporte[]> {
  const { data, error } = await db
    .from("inventario_faltantes")
    .select(SELECT)
    .eq("organization_id", orgId)
    .is("resolved_at", null)
    .order("reported_at", { ascending: false });
  if (error) {
    console.error("[listFaltantesAbiertos]", error);
    return [];
  }
  return (data ?? []).map((r) => mapReporte(r as unknown as Record<string, unknown>));
}

/** Recent reports, open or not, newest first (the panel's log). */
export async function listFaltantesRecientes(db: Db, orgId: string, limit = 40): Promise<FaltanteReporte[]> {
  const { data, error } = await db
    .from("inventario_faltantes")
    .select(SELECT)
    .eq("organization_id", orgId)
    .order("reported_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[listFaltantesRecientes]", error);
    return [];
  }
  return (data ?? []).map((r) => mapReporte(r as unknown as Record<string, unknown>));
}

export async function countFaltantesAbiertos(db: Db, orgId: string): Promise<{ agotado: number; bajo: number }> {
  const { data } = await db.from("inventario_faltantes").select("estado").eq("organization_id", orgId).is("resolved_at", null);
  const c = { agotado: 0, bajo: 0 };
  for (const r of data ?? []) {
    if (r.estado === "agotado") c.agotado += 1;
    else if (r.estado === "bajo") c.bajo += 1;
  }
  return c;
}

export interface RegistrarActor {
  orgId: string;
  restaurantId: string;
  shiftInstanceId: string | null;
  profileId: string;
}

export interface RegistrarItem {
  ingredienteId: string;
  estado: FaltanteEstado;
  note?: string;
}

/**
 * Record a batch of taps. Every tapped ingredient gets one new row that is
 * its current state; whatever was open for it before is resolved by the
 * same person ("actualizado"). An "ok" row is born resolved: it records
 * that the shelf was checked and closes the alert.
 */
export async function registrarEstados(db: Db, actor: RegistrarActor, items: RegistrarItem[]): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const ids = [...new Set(items.map((i) => i.ingredienteId))];
  if (ids.length === 0) return { ok: true, count: 0 };
  const { data: ings } = await db.from("ingredientes").select("id, stock_current").eq("organization_id", actor.orgId).in("id", ids);
  const stockById = new Map((ings ?? []).map((i) => [i.id as string, Number(i.stock_current ?? 0)]));
  if (stockById.size !== ids.length) return { ok: false, error: "Un ingrediente de la lista ya no existe." };
  const now = new Date().toISOString();
  const { error: closeErr } = await db
    .from("inventario_faltantes")
    .update({ resolved_at: now, resolved_by: actor.profileId, resolved_note: "actualizado" })
    .eq("organization_id", actor.orgId)
    .is("resolved_at", null)
    .in("ingrediente_id", ids);
  if (closeErr) {
    console.error("[registrarEstados] close:", closeErr);
    return { ok: false, error: "No se pudo actualizar el estado anterior." };
  }
  const rows = items.map((it) => ({
    organization_id: actor.orgId,
    restaurant_id: actor.restaurantId,
    shift_instance_id: actor.shiftInstanceId,
    ingrediente_id: it.ingredienteId,
    estado: it.estado,
    stock_sistema: stockById.get(it.ingredienteId) ?? null,
    note: it.note?.trim() || null,
    reported_by: actor.profileId,
    reported_at: now,
    resolved_at: it.estado === "ok" ? now : null,
    resolved_by: it.estado === "ok" ? actor.profileId : null,
    resolved_note: it.estado === "ok" ? "revisado: hay" : null,
  }));
  const { error } = await db.from("inventario_faltantes").insert(rows);
  if (error) {
    console.error("[registrarEstados] insert:", error);
    return { ok: false, error: "No se pudo guardar el reporte." };
  }
  return { ok: true, count: rows.length };
}

/** The owner (or whoever restocked) closes an open report. */
export async function resolverFaltante(db: Db, orgId: string, id: string, by: string, note?: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await db
    .from("inventario_faltantes")
    .update({ resolved_at: new Date().toISOString(), resolved_by: by, resolved_note: note?.trim() || "repuesto" })
    .eq("organization_id", orgId)
    .eq("id", id)
    .is("resolved_at", null)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Este faltante ya estaba resuelto." };
  return { ok: true };
}
