import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Puesto, TemplatePuesto } from "@/lib/types";

/**
 * Puestos (roles/stations) of a sede and their per-template configuration.
 * See migration 0025.
 */

export function normalizePuesto(row: Record<string, unknown>): Puesto {
  return {
    id: row.id as string,
    restaurant_id: row.restaurant_id as string,
    name: row.name as string,
    color: (row.color as string) ?? "ink",
    position: Number(row.position ?? 0),
  };
}

/** `template_puestos(*, puesto:puestos(*))` rows → typed, sorted by position. */
export function normalizeTemplatePuestoRows(raw: unknown): TemplatePuesto[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Record<string, unknown>[])
    .filter((r) => r && r.puesto)
    .map((r) => ({
      template_id: r.template_id as string,
      puesto_id: r.puesto_id as string,
      position: Number(r.position ?? 0),
      waits_for_task_id: (r.waits_for_task_id as string | null) ?? null,
      puesto: normalizePuesto(r.puesto as Record<string, unknown>),
    }))
    .sort((a, b) => a.position - b.position);
}

/** All puestos of a sede, in display order. */
export async function listPuestos(restaurantId: string): Promise<Puesto[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("puestos")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("position")
    .order("name");
  return (data ?? []).map((r) => normalizePuesto(r as Record<string, unknown>));
}
