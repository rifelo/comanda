import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConteoKind, InventarioConteo, InventarioConteoItem } from "@/lib/types";
import type { ConteoPropuesta, PropuestaStatus } from "./propuestas";

const SELECT =
  "id, organization_id, restaurant_id, shift_instance_id, kind, status, counted_by, submitted_at, reviewed_by, reviewed_at, note, review_note, counter:profiles!inventario_conteos_counted_by_fkey(full_name), inventario_conteo_items(id, ingrediente_id, expected, counted, unit_cost_cop, note, ingredientes(name, unit))";

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
