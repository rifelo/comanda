import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConteoKind, InventarioConteo, InventarioConteoItem } from "@/lib/types";

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
