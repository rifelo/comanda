"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";

const CreateSchema = z.object({
  restaurant_id: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
  details: z.string().trim().max(500).optional(),
  assigned_to: z.string().uuid().optional(),
  scheduled_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  due_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  requires_photo: z.boolean().optional(),
});

/** Admin creates a standalone to-do for the sede. */
export async function createTask(input: {
  restaurant_id: string;
  title: string;
  details?: string;
  assigned_to?: string;
  scheduled_date?: string;
  due_time?: string;
  requires_photo?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };

  const { supabase, user } = await requireAdmin();

  const { error } = await supabase.from("tasks").insert({
    restaurant_id: parsed.data.restaurant_id,
    title: parsed.data.title,
    details: parsed.data.details || null,
    assigned_to: parsed.data.assigned_to || null,
    created_by: user.id,
    scheduled_date: parsed.data.scheduled_date || null,
    due_time: parsed.data.due_time ? `${parsed.data.due_time}:00` : null,
    requires_photo: parsed.data.requires_photo ?? false,
    status: "pending",
  });
  if (error) {
    console.error("[createTask] insert failed:", error);
    return { ok: false, error: "No se pudo crear la tarea." };
  }

  revalidatePath("/turnos/tareas");
  return { ok: true };
}

const StatusSchema = z.object({ id: z.string().uuid(), done: z.boolean() });

/** Admin toggles completion (admin override — no photo enforced). */
export async function setTaskStatus(input: {
  id: string;
  done: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const parsed = StatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };

  const { supabase, user } = await requireAdmin();
  const { error } = await supabase
    .from("tasks")
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
  if (error) return { ok: false, error: "No se pudo actualizar." };

  revalidatePath("/turnos/tareas");
  return { ok: true };
}

const UpdateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
  details: z.string().trim().max(500).nullable(),
  assigned_to: z.string().uuid().nullable(),
  scheduled_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  due_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable(),
  requires_photo: z.boolean(),
  status: z.enum(["pending", "done"]),
});

/** Admin edits a task: title, details, assignee, schedule, photo flag, status. */
export async function updateTask(input: {
  id: string;
  title: string;
  details: string | null;
  assigned_to: string | null;
  scheduled_date: string | null;
  due_time: string | null;
  requires_photo: boolean;
  status: "pending" | "done";
}): Promise<{ ok: boolean; error?: string }> {
  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };

  const { supabase, user } = await requireAdmin();
  const d = parsed.data;

  const { error } = await supabase
    .from("tasks")
    .update({
      title: d.title,
      details: d.details || null,
      assigned_to: d.assigned_to || null,
      scheduled_date: d.scheduled_date || null,
      due_time: d.due_time ? `${d.due_time}:00` : null,
      requires_photo: d.requires_photo,
      ...(d.status === "done"
        ? {
            status: "done",
            completed_by: user.id,
            completed_at: new Date().toISOString(),
          }
        : { status: "pending", completed_by: null, completed_at: null }),
    })
    .eq("id", d.id);
  if (error) {
    console.error("[updateTask] failed:", error);
    return { ok: false, error: "No se pudo guardar." };
  }

  revalidatePath("/turnos/tareas");
  return { ok: true };
}

const DeleteSchema = z.object({ id: z.string().uuid() });

/** Admin deletes a task. */
export async function deleteTask(input: {
  id: string;
}): Promise<{ ok: boolean; error?: string }> {
  const parsed = DeleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };

  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("tasks").delete().eq("id", parsed.data.id);
  if (error) return { ok: false, error: "No se pudo eliminar." };

  revalidatePath("/turnos/tareas");
  return { ok: true };
}
