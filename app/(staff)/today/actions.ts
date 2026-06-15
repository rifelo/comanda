"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const SetDoneSchema = z.object({
  id: z.string().uuid(),
  done: z.boolean(),
  photo_url: z.string().url().optional(),
});

/** Staff marks an assigned standalone task done / not-done. RLS enforces that
 *  the task is assigned to this user (or unassigned). */
export async function setMyTaskDone(input: z.infer<typeof SetDoneSchema>) {
  const parsed = SetDoneSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "unauthorized" };

  const { error } = await supabase
    .from("tasks")
    .update(
      parsed.data.done
        ? {
            status: "done",
            completed_by: user.id,
            completed_at: new Date().toISOString(),
            photo_url: parsed.data.photo_url ?? null,
          }
        : {
            status: "pending",
            completed_by: null,
            completed_at: null,
            photo_url: null,
          },
    )
    .eq("id", parsed.data.id);
  if (error) return { error: error.message };

  revalidatePath("/today");
  return { ok: true };
}
