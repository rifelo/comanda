import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConteoKind, InventarioConteo, InventarioConteoItem } from "@/lib/types";
import { todayIdxOf } from "@/lib/turno/state";
import { todayInTz } from "@/lib/utils";
import { lineDiff } from "./conteo";
import type { ConteoPropuesta, PropuestaStatus } from "./propuestas";
import { rutinaHoy, type Rutina } from "./rutina";

const SELECT =
  "id, organization_id, restaurant_id, shift_instance_id, kind, status, counted_by, submitted_at, reviewed_by, reviewed_at, note, review_note, auto, counter:profiles!inventario_conteos_counted_by_fkey(full_name), inventario_conteo_items(id, ingrediente_id, expected, counted, unit_cost_cop, note, ingredientes(name, unit))";

function mapConteo(row: Record<string, unknown>): InventarioConteo {
  const counter = row.counter as { full_name: string | null } | null;
  const items = ((row.inventario_conteo_items ?? []) as Array<Record<string, unknown>>)
    .map((it): InventarioConteoItem => {
      const ing = it.ingredientes as { name: string; unit: string } | null;
      return {
        id: it.id as string,
        ingrediente_id: it.ingrediente_id as string,
        name: ing?.name ?? "—",
        unit: ing?.unit ?? "",
        expected: Number(it.expected),
        counted: Number(it.counted),
        unit_cost_cop: Number(it.unit_cost_cop ?? 0),
        note: (it.note as string | null) ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    restaurant_id: (row.restaurant_id as string | null) ?? null,
    shift_instance_id: (row.shift_instance_id as string | null) ?? null,
    kind: row.kind as ConteoKind,
    status: row.status as InventarioConteo["status"],
    counted_by: (row.counted_by as string | null) ?? null,
    counted_by_name: counter?.full_name ?? null,
    submitted_at: row.submitted_at as string,
    reviewed_by: (row.reviewed_by as string | null) ?? null,
    reviewed_at: (row.reviewed_at as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    review_note: (row.review_note as string | null) ?? null,
    auto: row.auto === true,
    items,
  };
}

/** Newest first. Works with the RLS client (admin panel) or the service role (tablet). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listConteos(db: SupabaseClient<any>, orgId: string, limit = 40): Promise<InventarioConteo[]> {
  const { data, error } = await db
    .from("inventario_conteos")
    .select(SELECT)
    .eq("organization_id", orgId)
    .order("submitted_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[listConteos]", error);
    return [];
  }
  return (data ?? []).map((r) => mapConteo(r as unknown as Record<string, unknown>));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getConteo(db: SupabaseClient<any>, orgId: string, id: string): Promise<InventarioConteo | null> {
  const { data } = await db.from("inventario_conteos").select(SELECT).eq("organization_id", orgId).eq("id", id).maybeSingle();
  return data ? mapConteo(data as unknown as Record<string, unknown>) : null;
}

/** When the last count of a kind was submitted (any status but rechazado), or null. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function lastConteoAt(db: SupabaseClient<any>, orgId: string, kind: ConteoKind): Promise<string | null> {
  const { data } = await db
    .from("inventario_conteos")
    .select("submitted_at")
    .eq("organization_id", orgId)
    .eq("kind", kind)
    .neq("status", "rechazado")
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.submitted_at as string | undefined) ?? null;
}

/** What the counter proposed with a count ("no está en la lista"), oldest first. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listPropuestas(db: SupabaseClient<any>, orgId: string, conteoId: string): Promise<ConteoPropuesta[]> {
  const { data, error } = await db
    .from("inventario_conteo_propuestas")
    .select("id, conteo_id, name, qty, unit, note, status, ingrediente_id, ingredientes(name)")
    .eq("organization_id", orgId)
    .eq("conteo_id", conteoId)
    .order("created_at");
  if (error) {
    console.error("[listPropuestas]", error);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id as string,
    conteo_id: r.conteo_id as string,
    name: r.name as string,
    qty: Number(r.qty),
    unit: r.unit as string,
    note: (r.note as string | null) ?? null,
    status: r.status as PropuestaStatus,
    ingrediente_id: (r.ingrediente_id as string | null) ?? null,
    ingrediente_name: ((r.ingredientes as unknown as { name: string } | null)?.name) ?? null,
  }));
}

/** Open proposals per count, for the "N por resolver" badge on the list. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function countPropuestasPendientes(db: SupabaseClient<any>, orgId: string): Promise<Record<string, number>> {
  const { data } = await db.from("inventario_conteo_propuestas").select("conteo_id").eq("organization_id", orgId).eq("status", "pendiente");
  const out: Record<string, number> = {};
  for (const r of data ?? []) out[r.conteo_id as string] = (out[r.conteo_id as string] ?? 0) + 1;
  return out;
}

function dateLabel(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 5 * 3_600_000); // Bogotá, no DST
  return d.toISOString().slice(0, 10);
}

/**
 * Turn a pending count into stock: every line whose counted quantity differs
 * from what the system expected at count time becomes an 'ajuste' movement
 * for that difference (sales since then are already in the stock, so the
 * delta is against the snapshot, not today's number). The status flips first,
 * guarded on 'pendiente', so a double tap can't apply the adjustments twice;
 * if the movements fail the count goes back to pending. `reviewerId` null =
 * applied by itself (a quick count within tolerance), signed by who counted.
 */
export async function aplicarConteo(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any>,
  orgId: string,
  conteo: InventarioConteo,
  by: { reviewerId: string | null; createdBy: string | null; note?: string | null },
): Promise<{ ok: true; adjusted: number } | { ok: false; error: string }> {
  const { data: flipped, error: fErr } = await db
    .from("inventario_conteos")
    .update({ status: "aprobado", reviewed_by: by.reviewerId, reviewed_at: new Date().toISOString(), review_note: by.note || null, auto: by.reviewerId === null })
    .eq("id", conteo.id)
    .eq("organization_id", orgId)
    .eq("status", "pendiente")
    .select("id");
  if (fErr || !flipped?.length) return { ok: false, error: "Este conteo ya fue revisado." };

  const label = `Conteo ${conteo.kind} ${dateLabel(conteo.submitted_at)}`;
  const movements = conteo.items
    .map((it) => ({ it, diff: lineDiff(it).diff }))
    .filter(({ diff }) => diff !== 0)
    .map(({ it, diff }) => ({
      organization_id: orgId,
      ingrediente_id: it.ingrediente_id,
      type: "ajuste" as const,
      delta: diff,
      note: `${label}${it.note ? ` · ${it.note}` : ""}`,
      created_by: by.createdBy,
    }));
  if (movements.length) {
    const { error } = await db.from("ingrediente_movements").insert(movements);
    if (error) {
      console.error("[aplicarConteo] movements:", error);
      await db.from("inventario_conteos").update({ status: "pendiente", reviewed_by: null, reviewed_at: null, review_note: null, auto: false }).eq("id", conteo.id);
      return { ok: false, error: "No se pudieron aplicar los ajustes." };
    }
  }
  return { ok: true, adjusted: movements.length };
}

/** A count as the tablet shows it on the hub: who, when, and what the owner said. */
export interface ConteoBreve {
  id: string;
  kind: ConteoKind;
  status: InventarioConteo["status"];
  auto: boolean;
  submitted_at: string;
  counted_by_name: string | null;
  review_note: string | null;
}

export interface RutinaEstado {
  rutina: Rutina;
  /** Weekday of the full count (lun = 0 … dom = 6). */
  completoDia: number;
  /** Today's counts, newest first (rejected ones included, so the note reaches the team). */
  hoy: ConteoBreve[];
  /** Counts still waiting for the owner, any day. */
  porAprobar: number;
}

/** What the inventory routine owes today at this sede's clock. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadRutina(db: SupabaseClient<any>, orgId: string, tz: string): Promise<RutinaEstado> {
  const today = todayInTz(tz);
  const [{ data: org }, { data: rows }, lastCompletoAt, { count: porAprobar }] = await Promise.all([
    db.from("organizations").select("conteo_completo_dia").eq("id", orgId).maybeSingle(),
    db
      .from("inventario_conteos")
      .select("id, kind, status, auto, submitted_at, review_note, counter:profiles!inventario_conteos_counted_by_fkey(full_name)")
      .eq("organization_id", orgId)
      .order("submitted_at", { ascending: false })
      .limit(8),
    lastConteoAt(db, orgId, "completo"),
    db.from("inventario_conteos").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "pendiente"),
  ]);
  const hoy = ((rows ?? []) as Array<Record<string, unknown>>)
    .filter((r) => todayInTz(tz, new Date(r.submitted_at as string)) === today)
    .map((r): ConteoBreve => {
      const who = r.counter as { full_name: string | null } | { full_name: string | null }[] | null;
      return {
        id: r.id as string,
        kind: r.kind as ConteoKind,
        status: r.status as InventarioConteo["status"],
        auto: r.auto === true,
        submitted_at: r.submitted_at as string,
        counted_by_name: (Array.isArray(who) ? who[0]?.full_name : who?.full_name) ?? null,
        review_note: (r.review_note as string | null) ?? null,
      };
    });
  const completoDia = Number(org?.conteo_completo_dia ?? 6);
  return {
    completoDia,
    rutina: rutinaHoy({
      todayIdx: todayIdxOf(today),
      completoDia,
      kindsHoy: hoy.filter((c) => c.status !== "rechazado").map((c) => c.kind),
      lastCompletoAt,
    }),
    hoy,
    porAprobar: porAprobar ?? 0,
  };
}

/** What the owner's panel says about counts: the ones waiting, and whether last night's was skipped. */
export interface ConteosPanel {
  pendientes: InventarioConteo[];
  /** Open proposals per pending count (they block the one-tap approve). */
  propuestas: Record<string, number>;
  /** Nobody counted yesterday, once the routine is running (a count exists). */
  ayerSinConteo: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadConteosPanel(db: SupabaseClient<any>, orgId: string, tz: string): Promise<ConteosPanel> {
  const [conteos, propuestas] = await Promise.all([listConteos(db, orgId, 12), countPropuestasPendientes(db, orgId)]);
  const ayer = todayInTz(tz, new Date(Date.now() - 86_400_000));
  return {
    pendientes: conteos.filter((c) => c.status === "pendiente"),
    propuestas,
    ayerSinConteo: conteos.length > 0 && !conteos.some((c) => c.status !== "rechazado" && todayInTz(tz, new Date(c.submitted_at)) === ayer),
  };
}
