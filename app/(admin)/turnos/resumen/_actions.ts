"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";

// Result shapes (documented in JSDoc — `"use server"` files cannot export
// type-only declarations without tripping the RSC encoder):
//
//   createShift / updateShift  → { ok: true; id: string } | { error: string }
//   deleteShift                → { ok: true; mode: "deleted" | "deactivated" }
//                              | { error: string }

const TimeRe = /^\d{2}:\d{2}(:\d{2})?$/;

const TaskSchema = z.object({
  id: z.string().uuid().optional(), // omitted for new tasks
  title: z.string().min(1).max(300),
  instructions: z.string().max(1000).nullable().optional(),
  due_time: z.string().regex(TimeRe).nullable().optional(),
  requires_photo: z.boolean(),
});

const ShiftBase = z.object({
  name: z.string().min(1).max(60),
  inicio: z.string().regex(TimeRe),
  fin: z.string().regex(TimeRe),
  dias: z.array(z.boolean()).length(7),
  tasks: z.array(TaskSchema),
});

const CreateSchema = ShiftBase;
const UpdateSchema = ShiftBase.extend({ id: z.string().uuid() });

const DeleteSchema = z.object({ id: z.string().uuid() });

function withSeconds(t: string): string {
  return /^\d{2}:\d{2}$/.test(t) ? `${t}:00` : t;
}

/**
 * Create a new shift (= checklist_template) + its tasks. Redirects to
 * /turnos/resumen on success so the caller doesn't need a separate
 * router.push (which can lock startTransition on Next 16).
 */
export async function createShift(input: z.infer<typeof CreateSchema>) {
  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos inválidos." };

  const sede = await getActiveSede();
  if (!sede) return { error: "Sin sede activa." };

  const { supabase } = await requireAdmin();

  const cleanTasks = parsed.data.tasks.filter(
    (t) => t.title.trim().length > 0,
  );

  const { data: tpl, error: tErr } = await supabase
    .from("checklist_templates")
    .insert({
      restaurant_id: sede.id,
      name: parsed.data.name.trim(),
      inicio: withSeconds(parsed.data.inicio),
      fin: withSeconds(parsed.data.fin),
      dias: parsed.data.dias,
      active: true,
    })
    .select("id")
    .single();

  if (tErr || !tpl) return { error: tErr?.message ?? "Error al crear turno." };

  if (cleanTasks.length > 0) {
    const rows = cleanTasks.map((t, i) => ({
      template_id: tpl.id as string,
      order_index: i + 1,
      title: t.title.trim(),
      instructions: t.instructions?.trim() || null,
      due_time: t.due_time ? withSeconds(t.due_time) : null,
      requires_photo: t.requires_photo,
    }));
    const { error: rErr } = await supabase.from("template_tasks").insert(rows);
    if (rErr) return { error: rErr.message };
  }

  revalidatePath("/turnos/resumen");
  revalidatePath("/turnos/asignacion");
  redirect("/turnos/resumen");
}

/**
 * Replace a shift's metadata + task list. Diffs against existing rows so we
 * UPDATE in place where possible (preserves IDs referenced by
 * task_completions). Tasks omitted from the payload are DELETED.
 */
export async function updateShift(input: z.infer<typeof UpdateSchema>) {
  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos inválidos." };

  const { supabase } = await requireAdmin();

  const { error: uErr } = await supabase
    .from("checklist_templates")
    .update({
      name: parsed.data.name.trim(),
      inicio: withSeconds(parsed.data.inicio),
      fin: withSeconds(parsed.data.fin),
      dias: parsed.data.dias,
    })
    .eq("id", parsed.data.id);
  if (uErr) return { error: uErr.message };

  const cleanTasks = parsed.data.tasks.filter(
    (t) => t.title.trim().length > 0,
  );

  const { data: existing } = await supabase
    .from("template_tasks")
    .select("id")
    .eq("template_id", parsed.data.id);

  const existingIds = new Set((existing ?? []).map((r) => r.id as string));
  const keptIds = new Set(
    cleanTasks.filter((t) => t.id).map((t) => t.id as string),
  );
  const toDelete = [...existingIds].filter((id) => !keptIds.has(id));

  if (toDelete.length > 0) {
    const { error } = await supabase
      .from("template_tasks")
      .delete()
      .in("id", toDelete);
    if (error) return { error: error.message };
  }

  // Updates + inserts in order.
  for (let i = 0; i < cleanTasks.length; i++) {
    const t = cleanTasks[i];
    const row = {
      template_id: parsed.data.id,
      order_index: i + 1,
      title: t.title.trim(),
      instructions: t.instructions?.trim() || null,
      due_time: t.due_time ? withSeconds(t.due_time) : null,
      requires_photo: t.requires_photo,
    };
    if (t.id) {
      const { error } = await supabase
        .from("template_tasks")
        .update(row)
        .eq("id", t.id);
      if (error) return { error: error.message };
    } else {
      const { error } = await supabase.from("template_tasks").insert(row);
      if (error) return { error: error.message };
    }
  }

  revalidatePath("/turnos/resumen");
  revalidatePath("/turnos/asignacion");
  redirect("/turnos/resumen");
}

/**
 * Soft-delete when shift_instances reference the shift (preserves history);
 * otherwise hard-delete (tasks cascade).
 */
export async function deleteShift(formData: FormData) {
  const parsed = DeleteSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: "Datos inválidos." };

  const { supabase } = await requireAdmin();

  const { count } = await supabase
    .from("shift_instances")
    .select("id", { count: "exact", head: true })
    .eq("template_id", parsed.data.id);

  if ((count ?? 0) > 0) {
    const { error } = await supabase
      .from("checklist_templates")
      .update({ active: false })
      .eq("id", parsed.data.id);
    if (error) return { error: error.message };
    revalidatePath("/turnos/resumen");
    redirect("/turnos/resumen");
  }

  const { error } = await supabase
    .from("checklist_templates")
    .delete()
    .eq("id", parsed.data.id);
  if (error) return { error: error.message };

  revalidatePath("/turnos/resumen");
  redirect("/turnos/resumen");
}
