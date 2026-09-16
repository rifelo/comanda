"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { listPuestos } from "@/lib/db/puestos";

// Result shapes (documented in JSDoc — `"use server"` files cannot export
// type-only declarations without tripping the RSC encoder):
//
//   createShift / updateShift  → { ok: true; id: string } | { error: string }
//   deleteShift                → { ok: true; mode: "deleted" | "deactivated" }
//                              | { error: string }

const TimeRe = /^\d{2}:\d{2}(:\d{2})?$/;

const TaskSchema = z.object({
  id: z.string().uuid().optional(), // omitted for new tasks
  /** Client key; lets a puesto's handoff gate point at a not-yet-saved task. */
  key: z.string().min(1).max(80).optional(),
  title: z.string().min(1).max(300),
  instructions: z.string().max(1000).nullable().optional(),
  due_time: z.string().regex(TimeRe).nullable().optional(),
  requires_photo: z.boolean(),
  /** puestos.id; null/omitted = compartida. */
  puesto_id: z.string().uuid().nullable().optional(),
});

const TemplatePuestoSchema = z.object({
  puesto_id: z.string().uuid(),
  position: z.number().int().min(0).max(100),
  /** TaskSchema.key of the task that gates this puesto (soft handoff). */
  waits_for_task_key: z.string().nullable().optional(),
});

const ShiftBase = z.object({
  name: z.string().min(1).max(60),
  inicio: z.string().regex(TimeRe),
  fin: z.string().regex(TimeRe),
  dias: z.array(z.boolean()).length(7),
  tasks: z.array(TaskSchema),
  puestos: z.array(TemplatePuestoSchema).default([]),
});

type TaskInput = z.infer<typeof TaskSchema>;
type PuestoInput = z.infer<typeof TemplatePuestoSchema>;

/**
 * Every puesto referenced (on tasks or as a template puesto) must belong to
 * the active sede — the RLS would reject foreign ones anyway, but a clear
 * message beats a constraint error.
 */
async function validPuestoIds(
  sedeId: string,
  tasks: TaskInput[],
  puestos: PuestoInput[],
): Promise<{ error: string } | { ok: true }> {
  const known = new Set((await listPuestos(sedeId)).map((p) => p.id));
  const used = new Set<string>();
  for (const t of tasks) if (t.puesto_id) used.add(t.puesto_id);
  for (const p of puestos) used.add(p.puesto_id);
  for (const id of used) if (!known.has(id)) return { error: "Un puesto no pertenece a esta sede." };
  return { ok: true };
}

/**
 * Replace the template's puesto configuration. `keyToId` resolves the gate
 * task from its client key (new tasks) or id (persisted tasks). A puesto may
 * not wait for one of its own tasks.
 */
async function syncTemplatePuestos(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  templateId: string,
  puestos: PuestoInput[],
  tasks: TaskInput[],
  keyToId: Map<string, string>,
): Promise<{ error: string } | { ok: true }> {
  const keep = new Set(puestos.map((p) => p.puesto_id));
  const { data: existing } = await supabase
    .from("template_puestos")
    .select("puesto_id")
    .eq("template_id", templateId);
  const gone = (existing ?? [])
    .map((r: { puesto_id: string }) => r.puesto_id)
    .filter((id: string) => !keep.has(id));
  if (gone.length) {
    const { error } = await supabase
      .from("template_puestos")
      .delete()
      .eq("template_id", templateId)
      .in("puesto_id", gone);
    if (error) return { error: error.message };
  }
  if (!puestos.length) return { ok: true };
  const rows = [];
  for (const p of puestos) {
    let gate: string | null = null;
    if (p.waits_for_task_key) {
      const task = tasks.find((t) => (t.key ?? t.id) === p.waits_for_task_key);
      if (task?.puesto_id === p.puesto_id) return { error: "Un puesto no puede esperar una tarea propia." };
      gate = keyToId.get(p.waits_for_task_key) ?? null;
    }
    rows.push({ template_id: templateId, puesto_id: p.puesto_id, position: p.position, waits_for_task_id: gate });
  }
  const { error } = await supabase
    .from("template_puestos")
    .upsert(rows, { onConflict: "template_id,puesto_id" });
  return error ? { error: error.message } : { ok: true };
}

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

  const check = await validPuestoIds(sede.id, cleanTasks, parsed.data.puestos);
  if ("error" in check) return check;

  const keyToId = new Map<string, string>();
  for (let i = 0; i < cleanTasks.length; i++) {
    const t = cleanTasks[i];
    const { data: row, error: rErr } = await supabase
      .from("template_tasks")
      .insert({
        template_id: tpl.id as string,
        order_index: i + 1,
        title: t.title.trim(),
        instructions: t.instructions?.trim() || null,
        due_time: t.due_time ? withSeconds(t.due_time) : null,
        requires_photo: t.requires_photo,
        puesto_id: t.puesto_id ?? null,
      })
      .select("id")
      .single();
    if (rErr || !row) return { error: rErr?.message ?? "Error al guardar tareas." };
    if (t.key) keyToId.set(t.key, row.id as string);
  }

  const synced = await syncTemplatePuestos(supabase, tpl.id as string, parsed.data.puestos, cleanTasks, keyToId);
  if ("error" in synced) return synced;

  revalidatePath("/turnos/resumen");
  revalidatePath("/turnos/asignacion");
  revalidatePath("/hoy");
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

  const sede = await getActiveSede();
  if (!sede) return { error: "Sin sede activa." };
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

  const check = await validPuestoIds(sede.id, cleanTasks, parsed.data.puestos);
  if ("error" in check) return check;

  // Updates + inserts in order; remember ids so puesto gates can resolve.
  const keyToId = new Map<string, string>();
  for (let i = 0; i < cleanTasks.length; i++) {
    const t = cleanTasks[i];
    const row = {
      template_id: parsed.data.id,
      order_index: i + 1,
      title: t.title.trim(),
      instructions: t.instructions?.trim() || null,
      due_time: t.due_time ? withSeconds(t.due_time) : null,
      requires_photo: t.requires_photo,
      puesto_id: t.puesto_id ?? null,
    };
    if (t.id) {
      const { error } = await supabase
        .from("template_tasks")
        .update(row)
        .eq("id", t.id);
      if (error) return { error: error.message };
      keyToId.set(t.id, t.id);
      if (t.key) keyToId.set(t.key, t.id);
    } else {
      const { data: ins, error } = await supabase
        .from("template_tasks")
        .insert(row)
        .select("id")
        .single();
      if (error || !ins) return { error: error?.message ?? "Error al guardar tareas." };
      if (t.key) keyToId.set(t.key, ins.id as string);
    }
  }

  const synced = await syncTemplatePuestos(supabase, parsed.data.id, parsed.data.puestos, cleanTasks, keyToId);
  if ("error" in synced) return synced;

  revalidatePath("/turnos/resumen");
  revalidatePath("/turnos/asignacion");
  revalidatePath("/hoy");
  redirect("/turnos/resumen");
}

const CreatePuestoSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z.enum(["ink", "red", "green", "amber", "indigo"]).default("ink"),
});

/**
 * Create a puesto for the active sede (from the shift editor's "+ puesto").
 * → { ok: true; puesto: { id, restaurant_id, name, color, position } } | { error }
 */
export async function createPuesto(input: z.infer<typeof CreatePuestoSchema>) {
  const parsed = CreatePuestoSchema.safeParse(input);
  if (!parsed.success) return { error: "Nombre inválido." };
  const sede = await getActiveSede();
  if (!sede) return { error: "Sin sede activa." };
  const { supabase } = await requireAdmin();
  const existing = await listPuestos(sede.id);
  const position = existing.reduce((m, p) => Math.max(m, p.position), -1) + 1;
  const { data, error } = await supabase
    .from("puestos")
    .insert({ restaurant_id: sede.id, name: parsed.data.name, color: parsed.data.color, position })
    .select("*")
    .single();
  if (error || !data) {
    if (error?.code === "23505") return { error: "Ya existe un puesto con ese nombre." };
    return { error: error?.message ?? "No se pudo crear el puesto." };
  }
  revalidatePath("/turnos/resumen");
  return {
    ok: true as const,
    puesto: { id: data.id as string, restaurant_id: data.restaurant_id as string, name: data.name as string, color: data.color as string, position: Number(data.position) },
  };
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
