"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";

// publishWeek result (documented for clients — `"use server"` files can only
// export async functions, no `type` exports):
//   { ok: true; written: number; deleted: number } | { error: string }

const ChangeSchema = z.object({
  template_id: z.string().uuid(),
  dia_idx: z.number().int().min(0).max(6),
  member_id: z.string().uuid().nullable(),
});

const PublishSchema = z.object({
  week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  changes: z.array(ChangeSchema),
});

/**
 * Persist a week of assignment edits.
 *
 *   - cells with `member_id` ≠ null → upsert into `weekly_assignments`
 *   - cells with `member_id` === null → delete the matching row (if any)
 *
 * The unique key `(restaurant_id, week_start, template_id, dia_idx)` makes
 * the upsert deterministic. Errors abort and return the message.
 */
export async function publishWeek(input: z.infer<typeof PublishSchema>) {
  const parsed = PublishSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos inválidos." };

  const sede = await getActiveSede();
  if (!sede) return { error: "Sin sede activa." };

  const { supabase } = await requireAdmin();

  const toUpsert = parsed.data.changes
    .filter((c) => c.member_id !== null)
    .map((c) => ({
      restaurant_id: sede.id,
      week_start: parsed.data.week_start,
      template_id: c.template_id,
      dia_idx: c.dia_idx,
      member_id: c.member_id,
    }));

  const toClear = parsed.data.changes.filter((c) => c.member_id === null);

  let written = 0;
  if (toUpsert.length > 0) {
    const { error } = await supabase
      .from("weekly_assignments")
      .upsert(toUpsert, {
        onConflict: "restaurant_id,week_start,template_id,dia_idx",
      });
    if (error) return { error: error.message };
    written = toUpsert.length;
  }

  let deleted = 0;
  for (const c of toClear) {
    const { error, count } = await supabase
      .from("weekly_assignments")
      .delete({ count: "exact" })
      .eq("restaurant_id", sede.id)
      .eq("week_start", parsed.data.week_start)
      .eq("template_id", c.template_id)
      .eq("dia_idx", c.dia_idx);
    if (error) return { error: error.message };
    deleted += count ?? 0;
  }

  revalidatePath("/turnos/asignacion");
  revalidatePath("/turnos/resumen");
  return { ok: true, written, deleted };
}
