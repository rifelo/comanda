"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";

// Result shape for deleteTemplate (documented for clients; not exported
// because `"use server"` files can only export async functions):
//   { ok: true; mode: "deleted" | "deactivated"; restaurantId: string }
// | { ok: false; error: string }

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

const DeleteSchema = z.object({
  template_id: z.string().uuid(),
});

type DeleteResult =
  | { ok: true; mode: "deleted" | "deactivated"; restaurantId: string }
  | { ok: false; error: string };

/**
 * Remove a checklist_template. Soft-deletes (active=false) when historical
 * shift_instances reference it — the schema's `on delete restrict` would
 * block a hard-delete anyway, but doing the check ourselves lets us return a
 * clean result instead of a foreign-key error, and skips the round-trip to
 * Postgres in the safe case.
 */
export async function deleteTemplate(
  _prev: DeleteResult | null,
  formData: FormData,
): Promise<DeleteResult> {
  const parsed = DeleteSchema.safeParse({
    template_id: formData.get("template_id"),
  });
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };

  const { supabase } = await requireAdmin();

  // RLS limits this to templates in the admin's org. Looking up
  // restaurant_id here also gives us where to send the user next.
  const { data: tpl, error: tErr } = await supabase
    .from("checklist_templates")
    .select("id, restaurant_id, active")
    .eq("id", parsed.data.template_id)
    .single();
  if (tErr || !tpl) return { ok: false, error: "Plantilla no encontrada." };

  const { count } = await supabase
    .from("shift_instances")
    .select("id", { count: "exact", head: true })
    .eq("template_id", parsed.data.template_id);

  if ((count ?? 0) > 0) {
    const { error } = await supabase
      .from("checklist_templates")
      .update({ active: false })
      .eq("id", parsed.data.template_id);
    if (error) {
      console.error("[deleteTemplate] soft-delete failed:", error);
      return { ok: false, error: error.message };
    }
    revalidatePath(`/restaurants/${tpl.restaurant_id}`);
    return { ok: true, mode: "deactivated", restaurantId: tpl.restaurant_id };
  }

  // No shifts → hard-delete; `template_tasks` cascades on FK.
  const { error } = await supabase
    .from("checklist_templates")
    .delete()
    .eq("id", parsed.data.template_id);
  if (error) {
    console.error("[deleteTemplate] hard-delete failed:", error);
    return { ok: false, error: error.message };
  }
  revalidatePath(`/restaurants/${tpl.restaurant_id}`);
  return { ok: true, mode: "deleted", restaurantId: tpl.restaurant_id };
}
