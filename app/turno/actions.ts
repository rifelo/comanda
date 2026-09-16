"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertPersonOnRoster, requireTurnoContext, type TurnoContext } from "@/lib/turno/server";

/**
 * Shared-tablet actions. They run on the service-role client after
 * `requireTurnoContext()` (paired device or signed-in user) and act *as* the
 * person tapped on the tablet (`person_id`), who must be on the sede roster.
 * Every write first checks the shift instance belongs to the context's sede.
 */

const Ids = z.object({
  shift_instance_id: z.string().uuid(),
  template_task_id: z.string().uuid(),
  person_id: z.string().uuid(),
});
const CompleteSchema = Ids.extend({
  photo_url: z.string().url().optional(),
  note: z.string().max(500).optional(),
});
const CloseSchema = z.object({ shift_instance_id: z.string().uuid(), person_id: z.string().uuid() });

type Simple = { ok: true } | { ok: false; error: string };

async function ownInstance(ctx: TurnoContext, shiftInstanceId: string) {
  const { data } = await ctx.admin
    .from("shift_instances")
    .select("id, restaurant_id, status, opened_by")
    .eq("id", shiftInstanceId)
    .eq("restaurant_id", ctx.restaurantId)
    .maybeSingle();
  return data;
}

function fail(err: unknown, fallback: string): Simple {
  if (err instanceof Error && err.message === "unauthorized") return { ok: false, error: "Sin acceso. Empareja la tablet o inicia sesión." };
  return { ok: false, error: err instanceof Error ? err.message : fallback };
}

function revalidate() {
  revalidatePath("/turno");
  revalidatePath("/hoy");
}

/** Mark a task done as `person_id` (upsert, so a retry is harmless). */
export async function completeTaskAs(input: unknown): Promise<Simple> {
  const parsed = CompleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };
  try {
    const ctx = await requireTurnoContext();
    const inst = await ownInstance(ctx, parsed.data.shift_instance_id);
    if (!inst) return { ok: false, error: "Turno no encontrado." };
    if (inst.status === "closed") return { ok: false, error: "El turno ya está cerrado." };
    await assertPersonOnRoster(ctx, parsed.data.person_id);
    const { error } = await ctx.admin.from("task_completions").upsert(
      {
        shift_instance_id: parsed.data.shift_instance_id,
        template_task_id: parsed.data.template_task_id,
        completed_by: parsed.data.person_id,
        photo_url: parsed.data.photo_url ?? null,
        note: parsed.data.note ?? null,
      },
      { onConflict: "shift_instance_id,template_task_id" },
    );
    if (error) return { ok: false, error: error.message };
    if (!inst.opened_by) {
      await ctx.admin
        .from("shift_instances")
        .update({ opened_by: parsed.data.person_id, opened_at: new Date().toISOString() })
        .eq("id", inst.id);
    }
    revalidate();
    return { ok: true };
  } catch (err) {
    return fail(err, "No se pudo marcar la tarea.");
  }
}

/** Undo a completion (same person or anyone on the tablet — it's a shared device). */
export async function uncompleteTaskAs(input: unknown): Promise<Simple> {
  const parsed = Ids.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };
  try {
    const ctx = await requireTurnoContext();
    const inst = await ownInstance(ctx, parsed.data.shift_instance_id);
    if (!inst) return { ok: false, error: "Turno no encontrado." };
    if (inst.status === "closed") return { ok: false, error: "El turno ya está cerrado." };
    await assertPersonOnRoster(ctx, parsed.data.person_id);
    const { error } = await ctx.admin
      .from("task_completions")
      .delete()
      .eq("shift_instance_id", parsed.data.shift_instance_id)
      .eq("template_task_id", parsed.data.template_task_id);
    if (error) return { ok: false, error: error.message };
    revalidate();
    return { ok: true };
  } catch (err) {
    return fail(err, "No se pudo desmarcar la tarea.");
  }
}

/**
 * Upload an evidence photo from the tablet (no browser session in device
 * mode, so the storage write goes through the service role). Fields: file,
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

/** Close today's turno from the tablet. */
export async function closeTurnoAs(input: unknown): Promise<Simple> {
  const parsed = CloseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };
  try {
    const ctx = await requireTurnoContext();
    const inst = await ownInstance(ctx, parsed.data.shift_instance_id);
    if (!inst) return { ok: false, error: "Turno no encontrado." };
    await assertPersonOnRoster(ctx, parsed.data.person_id);
    const { error } = await ctx.admin
      .from("shift_instances")
      .update({ status: "closed", closed_by: parsed.data.person_id, closed_at: new Date().toISOString() })
      .eq("id", inst.id)
      .eq("status", "open");
    if (error) return { ok: false, error: error.message };
    revalidate();
    return { ok: true };
  } catch (err) {
    return fail(err, "No se pudo cerrar el turno.");
  }
}
