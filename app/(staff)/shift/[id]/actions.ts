"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const CompleteSchema = z.object({
  shift_instance_id: z.string().uuid(),
  template_task_id: z.string().uuid(),
  photo_url: z.string().url().optional(),
  note: z.string().max(500).optional(),
});

/** Mark a task complete (or update note/photo). */
export async function completeTask(input: z.infer<typeof CompleteSchema>) {
  const parsed = CompleteSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "unauthorized" };

  const { error } = await supabase.from("task_completions").upsert(
    {
      shift_instance_id: parsed.data.shift_instance_id,
      template_task_id: parsed.data.template_task_id,
      completed_by: user.id,
      photo_url: parsed.data.photo_url ?? null,
      note: parsed.data.note ?? null,
    },
    { onConflict: "shift_instance_id,template_task_id" },
  );
  if (error) return { error: error.message };

  revalidatePath(`/shift/${parsed.data.shift_instance_id}`);
  return { ok: true };
}

const UncompleteSchema = z.object({
  shift_instance_id: z.string().uuid(),
  template_task_id: z.string().uuid(),
});

/** Revert a checked task. */
export async function uncompleteTask(input: z.infer<typeof UncompleteSchema>) {
  const parsed = UncompleteSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "unauthorized" };

  const { error } = await supabase
    .from("task_completions")
    .delete()
    .eq("shift_instance_id", parsed.data.shift_instance_id)
    .eq("template_task_id", parsed.data.template_task_id);
  if (error) return { error: error.message };

  revalidatePath(`/shift/${parsed.data.shift_instance_id}`);
  return { ok: true };
}

const SubmitNovedadSchema = z.object({
  shift_instance_id: z.string().uuid(),
  body: z.string().min(3).max(2000),
});

export async function submitNovedad(input: z.infer<typeof SubmitNovedadSchema>) {
  const parsed = SubmitNovedadSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "unauthorized" };

  // Look up restaurant_id from the shift to satisfy the not-null constraint.
  const { data: shift } = await supabase
    .from("shift_instances")
    .select("restaurant_id")
    .eq("id", parsed.data.shift_instance_id)
    .single();
  if (!shift) return { error: "shift_not_found" };

  const { error } = await supabase.from("novedades").insert({
    shift_instance_id: parsed.data.shift_instance_id,
    restaurant_id: shift.restaurant_id,
    submitted_by: user.id,
    body: parsed.data.body,
  });
  if (error) return { error: error.message };

  revalidatePath(`/shift/${parsed.data.shift_instance_id}`);
  return { ok: true };
}

const SetAdHocDoneSchema = z.object({
  id: z.string().uuid(),
  shift_instance_id: z.string().uuid(),
  done: z.boolean(),
});

/** Staff marks an ad-hoc task done / not-done. RLS enforces that the task is
 *  assigned to this user or to the whole shift. */
export async function setAdHocDone(input: z.infer<typeof SetAdHocDoneSchema>) {
  const parsed = SetAdHocDoneSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "unauthorized" };

  const { error } = await supabase
    .from("ad_hoc_tasks")
    .update(
      parsed.data.done
        ? {
            status: "done",
            completed_by: user.id,
            completed_at: new Date().toISOString(),
          }
        : { status: "pending", completed_by: null, completed_at: null },
    )
    .eq("id", parsed.data.id);
  if (error) return { error: error.message };

  revalidatePath(`/shift/${parsed.data.shift_instance_id}`);
  return { ok: true };
}

const CloseSchema = z.object({ shift_instance_id: z.string().uuid() });

export async function closeShift(input: z.infer<typeof CloseSchema>) {
  const parsed = CloseSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "unauthorized" };

  const { error } = await supabase
    .from("shift_instances")
    .update({
      status: "closed",
      closed_by: user.id,
      closed_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.shift_instance_id);
  if (error) return { error: error.message };

  revalidatePath(`/shift/${parsed.data.shift_instance_id}`);
  revalidatePath(`/today`);
  return { ok: true };
}
