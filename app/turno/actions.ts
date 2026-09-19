"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTurnoContext, type TurnoContext } from "@/lib/turno/server";

/**
 * Shared-tablet actions. They run on the service-role client after
 * `requireTurnoContext()` — a paired device or a laptop session, plus a
 * signed-in person who is on the sede roster — and stamp every write with
 * that person (`ctx.actor.profileId`). Every write first checks the shift
 * instance belongs to the context's sede.
 */

const Ids = z.object({
  shift_instance_id: z.string().uuid(),
  template_task_id: z.string().uuid(),
});
const CompleteSchema = Ids.extend({
  photo_url: z.string().url().optional(),
  note: z.string().max(500).optional(),
});
const ShiftOnly = z.object({ shift_instance_id: z.string().uuid() });
const AdHocSchema = ShiftOnly.extend({ id: z.string().uuid(), done: z.boolean() });
const NovedadSchema = ShiftOnly.extend({ body: z.string().trim().min(3, "Escribe la novedad.").max(2000) });

type Simple = { ok: true } | { ok: false; error: string };

async function ownInstance(ctx: TurnoContext, shiftInstanceId: string) {
  const { data } = await ctx.admin
    .from("shift_instances")
    .select("id, restaurant_id, status, opened_by, date")
    .eq("id", shiftInstanceId)
    .eq("restaurant_id", ctx.restaurantId)
    .maybeSingle();
  return data;
}

function fail(err: unknown, fallback: string): Simple {
  if (err instanceof Error && err.message === "unauthorized") return { ok: false, error: "Sin acceso. Inicia sesión otra vez." };
  return { ok: false, error: err instanceof Error ? err.message : fallback };
}

function revalidate(date?: string) {
  revalidatePath("/turno");
  revalidatePath("/hoy");
  if (date) revalidatePath(`/hoy/${date}`);
}

/** Mark a task done as the signed-in person (upsert, so a retry is harmless). */
export async function completeTaskAs(input: unknown): Promise<Simple> {
  const parsed = CompleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };
  try {
    const ctx = await requireTurnoContext();
    const inst = await ownInstance(ctx, parsed.data.shift_instance_id);
    if (!inst) return { ok: false, error: "Turno no encontrado." };
    if (inst.status === "closed") return { ok: false, error: "El turno ya está cerrado." };
    const { error } = await ctx.admin.from("task_completions").upsert(
      {
        shift_instance_id: parsed.data.shift_instance_id,
        template_task_id: parsed.data.template_task_id,
        completed_by: ctx.actor.profileId,
        photo_url: parsed.data.photo_url ?? null,
        note: parsed.data.note ?? null,
      },
      { onConflict: "shift_instance_id,template_task_id" },
    );
    if (error) return { ok: false, error: error.message };
    if (!inst.opened_by) {
      await ctx.admin
        .from("shift_instances")
        .update({ opened_by: ctx.actor.profileId, opened_at: new Date().toISOString() })
        .eq("id", inst.id);
    }
    revalidate(inst.date as string);
    return { ok: true };
  } catch (err) {
    return fail(err, "No se pudo marcar la tarea.");
  }
}

/** Undo a completion — anyone on the tablet may, it's a shared device. */
export async function uncompleteTaskAs(input: unknown): Promise<Simple> {
  const parsed = Ids.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };
  try {
    const ctx = await requireTurnoContext();
    const inst = await ownInstance(ctx, parsed.data.shift_instance_id);
    if (!inst) return { ok: false, error: "Turno no encontrado." };
    if (inst.status === "closed") return { ok: false, error: "El turno ya está cerrado." };
    const { error } = await ctx.admin
      .from("task_completions")
      .delete()
      .eq("shift_instance_id", parsed.data.shift_instance_id)
      .eq("template_task_id", parsed.data.template_task_id);
    if (error) return { ok: false, error: error.message };
    revalidate(inst.date as string);
    return { ok: true };
  } catch (err) {
    return fail(err, "No se pudo desmarcar la tarea.");
  }
}

/**
 * Upload an evidence photo from the tablet (the storage write goes through
 * the service role, like every other tablet write). Fields: file,
 * shift_instance_id, template_task_id. → { ok, url } | { ok: false, error }
 */
export async function uploadTurnoPhoto(formData: FormData): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const file = formData.get("file");
  const shiftInstanceId = String(formData.get("shift_instance_id") ?? "");
  const taskId = String(formData.get("template_task_id") ?? "");
  if (!(file instanceof Blob) || !z.string().uuid().safeParse(shiftInstanceId).success || !z.string().uuid().safeParse(taskId).success) {
    return { ok: false, error: "Datos inválidos." };
  }
  if (file.size > 8 * 1024 * 1024) return { ok: false, error: "La foto supera 8 MB." };
  try {
    const ctx = await requireTurnoContext();
    const inst = await ownInstance(ctx, shiftInstanceId);
    if (!inst) return { ok: false, error: "Turno no encontrado." };
    const ext = file.type.includes("png") ? "png" : "jpg";
    const random = Math.random().toString(36).slice(2, 10);
    const path = `${ctx.restaurantId}/${shiftInstanceId}/${taskId}-${random}.${ext}`;
    const { error: upErr } = await ctx.admin.storage
      .from("task-photos")
      .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
    if (upErr) return { ok: false, error: upErr.message };
    const { data: signed, error: sErr } = await ctx.admin.storage
      .from("task-photos")
      .createSignedUrl(path, 60 * 60 * 24 * 30);
    if (sErr || !signed) return { ok: false, error: sErr?.message ?? "No se pudo firmar la foto." };
    return { ok: true, url: signed.signedUrl };
  } catch (err) {
    const r = fail(err, "No se pudo subir la foto.");
    return r.ok ? { ok: false, error: "No se pudo subir la foto." } : r;
  }
}

/**
 * Tick / untick an ad-hoc ("inmediata") task raised by the admin from /hoy.
 * Mirrors the RLS rule of `ad_hoc_tasks`: admins, unassigned tasks, or the
 * assignee themself.
 */
export async function setAdHocDoneAs(input: unknown): Promise<Simple> {
  const parsed = AdHocSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };
  try {
    const ctx = await requireTurnoContext();
    const inst = await ownInstance(ctx, parsed.data.shift_instance_id);
    if (!inst) return { ok: false, error: "Turno no encontrado." };
    if (inst.status === "closed") return { ok: false, error: "El turno ya está cerrado." };
    const { data: task } = await ctx.admin
      .from("ad_hoc_tasks")
      .select("id, assigned_to, status")
      .eq("id", parsed.data.id)
      .eq("shift_instance_id", inst.id)
      .maybeSingle();
    if (!task) return { ok: false, error: "Tarea no encontrada." };
    if (task.status === "cancelled") return { ok: false, error: "Esa tarea fue cancelada." };
    const mine = ctx.actor.role === "admin" || !task.assigned_to || task.assigned_to === ctx.actor.profileId;
    if (!mine) return { ok: false, error: "Esa tarea está asignada a otra persona." };
    const { error } = await ctx.admin
      .from("ad_hoc_tasks")
      .update(
        parsed.data.done
          ? { status: "done", completed_by: ctx.actor.profileId, completed_at: new Date().toISOString() }
          : { status: "pending", completed_by: null, completed_at: null },
      )
      .eq("id", task.id);
    if (error) return { ok: false, error: error.message };
    revalidate(inst.date as string);
    return { ok: true };
  } catch (err) {
    return fail(err, "No se pudo actualizar la tarea.");
  }
}

/** Log a novedad (shift note) for the selected turno as the signed-in person. */
export async function submitNovedadAs(input: unknown): Promise<Simple> {
  const parsed = NovedadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  try {
    const ctx = await requireTurnoContext();
    const inst = await ownInstance(ctx, parsed.data.shift_instance_id);
    if (!inst) return { ok: false, error: "Turno no encontrado." };
    const { error } = await ctx.admin.from("novedades").insert({
      shift_instance_id: inst.id,
      restaurant_id: ctx.restaurantId,
      submitted_by: ctx.actor.profileId,
      body: parsed.data.body,
    });
    if (error) return { ok: false, error: error.message };
    revalidate(inst.date as string);
    return { ok: true };
  } catch (err) {
    return fail(err, "No se pudo registrar la novedad.");
  }
}

/** Close today's turno from the tablet; the closer is the signed-in person. */
export async function closeTurnoAs(input: unknown): Promise<Simple> {
  const parsed = ShiftOnly.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };
  try {
    const ctx = await requireTurnoContext();
    const inst = await ownInstance(ctx, parsed.data.shift_instance_id);
    if (!inst) return { ok: false, error: "Turno no encontrado." };
    const now = new Date().toISOString();
    const { error } = await ctx.admin
      .from("shift_instances")
      .update({
        status: "closed",
        closed_by: ctx.actor.profileId,
        closed_at: now,
        // A turno closed without a single tick still gets an opener, so the
        // summary can show who ran it and for how long.
        ...(inst.opened_by ? {} : { opened_by: ctx.actor.profileId, opened_at: now }),
      })
      .eq("id", inst.id)
      .eq("status", "open");
    if (error) return { ok: false, error: error.message };
    revalidate(inst.date as string);
    return { ok: true };
  } catch (err) {
    return fail(err, "No se pudo cerrar el turno.");
  }
}
