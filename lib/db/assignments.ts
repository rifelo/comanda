import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { WeeklyAssignment } from "@/lib/types";

/**
 * Weekly assignments for the Asignación grid.
 *
 * `weekStart` is the ISO Monday for the visible week. The grid is
 * `(template_id × dia_idx × puesto_id|null)` → `member_id | null`; this
 * returns one row per non-null cell (puesto_id null = legacy whole-turno). Closed-day cells are derived client-side from the shift's
 * `dias[]` mask.
 */
export async function listAssignments(
  restaurantId: string,
  weekStart: string,
): Promise<WeeklyAssignment[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("weekly_assignments")
    .select("week_start, template_id, dia_idx, member_id, puesto_id")
    .eq("restaurant_id", restaurantId)
    .eq("week_start", weekStart);
  if (!data) return [];
  return data.map((row) => ({
    week_start: row.week_start as string,
    template_id: row.template_id as string,
    dia_idx: row.dia_idx as number,
    member_id: (row.member_id as string | null) ?? null,
    puesto_id: (row.puesto_id as string | null) ?? null,
  }));
}

/**
 * The ISO Monday for the week containing `date` (local-date semantics).
 * Returns a YYYY-MM-DD string. `weekOffset` shifts by ±7 days per unit.
 *
 * Day-of-week is computed in UTC against the YYYY-MM-DD string itself (no
 * timezone reinterpretation), so the same `date` argument always yields
 * the same Monday regardless of where the server runs.
 */
export function isoMonday(
  yyyyMMdd: string,
  weekOffset: number = 0,
): string {
  const [y, m, d] = yyyyMMdd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay(); // 0 = Sunday … 6 = Saturday
  // Days to subtract to land on Monday: Sun → 6, Mon → 0, Tue → 1, …
  const sub = dow === 0 ? 6 : dow - 1;
  dt.setUTCDate(dt.getUTCDate() - sub + weekOffset * 7);
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
