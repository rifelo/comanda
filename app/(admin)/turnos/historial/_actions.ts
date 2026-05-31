"use server";

import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";

// Result shapes (documented in JSDoc — `"use server"` files cannot export
// type-only declarations without tripping the RSC encoder):
//
//   getShiftDetail → {
//     tasks: {
//       id, title, due_time (HH:MM | null), requires_photo,
//       completed, completed_at (string | null),
//       completed_by_name (string | null), photo_url (string | null),
//       note (string | null),
//     }[];
//     novedades: { id, body, submitted_at, submitter (string | null) }[];
//   }
//
// On any auth/ownership/validation failure we return an empty shape
// (`{ tasks: [], novedades: [] }`) rather than throwing, so the client can
// render the "sin checklist" empty state without a crash.

const ShiftIdSchema = z.object({ shiftInstanceId: z.string().uuid() });

const EMPTY = { tasks: [], novedades: [] };

/**
 * Per-shift detail for the Historial pane. Fetches the shift's template tasks
 * left-joined against the real `task_completions` for THIS shift_instance
 * (which task was done, when, by whom, with what photo), plus the shift's
 * novedades. Ownership is enforced against the active sede.
 */
export async function getShiftDetail(shiftInstanceId: string) {
  const parsed = ShiftIdSchema.safeParse({ shiftInstanceId });
  if (!parsed.success) return EMPTY;

  const [{ supabase }, sede] = await Promise.all([
    requireAdmin(),
    getActiveSede(),
  ]);
  if (!sede) return EMPTY;

  // Resolve the shift and verify it belongs to the active sede before
  // exposing any of its detail.
  const { data: shift } = await supabase
    .from("shift_instances")
    .select("id, restaurant_id, template_id")
    .eq("id", parsed.data.shiftInstanceId)
    .single();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sh = shift as any;
  if (!sh || sh.restaurant_id !== sede.id) return EMPTY;

  // Template tasks left-joined against this shift's completions. The join is
  // filtered by shift_instance_id so a task with no completion row for THIS
  // shift comes back with a null completion (= not done here).
  const [{ data: taskRows }, { data: novRows }] = await Promise.all([
    supabase
      .from("template_tasks")
      .select(
        `id, title, due_time, requires_photo, order_index,
         completions:task_completions!left(
           shift_instance_id, completed_at, photo_url, note,
           completer:profiles!task_completions_completed_by_fkey(full_name)
         )`,
      )
      .eq("template_id", sh.template_id)
      .eq("completions.shift_instance_id", parsed.data.shiftInstanceId)
      .order("order_index"),
    supabase
      .from("novedades")
      .select(
        `id, body, submitted_at,
         submitter:profiles!novedades_submitted_by_fkey(full_name)`,
      )
      .eq("shift_instance_id", parsed.data.shiftInstanceId)
      .order("submitted_at"),
  ]);

  const tasks = (taskRows ?? []).map((t) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = t as any;
    const c = Array.isArray(tx.completions) ? tx.completions[0] : null;
    return {
      id: tx.id as string,
      title: tx.title as string,
      due_time:
        ((tx.due_time as string | null) ?? null)?.slice(0, 5) ?? null,
      requires_photo: tx.requires_photo as boolean,
      completed: Boolean(c),
      completed_at: (c?.completed_at as string | null) ?? null,
      completed_by_name: (c?.completer?.full_name as string | null) ?? null,
      photo_url: (c?.photo_url as string | null) ?? null,
      note: (c?.note as string | null) ?? null,
    };
  });

  const novedades = (novRows ?? []).map((n) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nx = n as any;
    return {
      id: nx.id as string,
      body: nx.body as string,
      submitted_at: nx.submitted_at as string,
      submitter: (nx.submitter?.full_name as string | null) ?? null,
    };
  });

  return { tasks, novedades };
}
