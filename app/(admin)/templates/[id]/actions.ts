"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";

const TaskSchema = z.object({
  id: z.string().uuid().optional(), // omitted for new tasks
  title: z.string().min(1).max(300),
  instructions: z.string().max(1000).nullable().optional(),
  due_time: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/)
    .nullable()
    .optional(),
  requires_photo: z.boolean(),
});

const SaveSchema = z.object({
  template_id: z.string().uuid(),
  tasks: z.array(TaskSchema),
});

/**
 * Replace a template's task list. We do a diff:
 *  - tasks with an `id` => UPDATE in place + new order_index
 *  - tasks without an `id` => INSERT
 *  - existing rows whose id wasn't sent => DELETE (admin removed them)
 *
 * order_index comes from the client array order.
 */
export async function saveTemplate(input: z.infer<typeof SaveSchema>) {
  const parsed = SaveSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const { supabase } = await requireAdmin();

  // Fetch existing tasks to compute deletes.
  const { data: existing } = await supabase
    .from("template_tasks")
    .select("id")
    .eq("template_id", parsed.data.template_id);

  const existingIds = new Set((existing ?? []).map((r) => r.id));
  const keptIds = new Set(
    parsed.data.tasks.filter((t) => t.id).map((t) => t.id as string),
  );
  const toDelete = [...existingIds].filter((id) => !keptIds.has(id));

  if (toDelete.length > 0) {
    const { error } = await supabase
      .from("template_tasks")
      .delete()
      .in("id", toDelete);
    if (error) return { error: error.message };
  }

  // Upserts (update existing, insert new).
  const rows = parsed.data.tasks.map((t, i) => ({
    id: t.id,
    template_id: parsed.data.template_id,
    title: t.title,
    instructions: t.instructions ?? null,
    due_time: t.due_time ?? null,
    requires_photo: t.requires_photo,
    order_index: i + 1,
  }));

  // Update existing rows individually (Supabase upsert by `id` keeps PK).
  for (const row of rows) {
    if (row.id) {
      const { error } = await supabase
        .from("template_tasks")
        .update(row)
        .eq("id", row.id);
      if (error) return { error: error.message };
    } else {
      // Strip undefined `id` so Postgres generates one.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _ignore, ...insertRow } = row;
      const { error } = await supabase
        .from("template_tasks")
        .insert(insertRow);
      if (error) return { error: error.message };
    }
  }

  revalidatePath(`/templates/${parsed.data.template_id}`);
  return { ok: true };
}
