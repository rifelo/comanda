"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";

const CreateSchema = z.object({
  shift_instance_id: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
  instructions: z.string().trim().max(500).optional(),
  // empty string / undefined => unassigned (whole shift)
  assigned_to: z.string().uuid().optional(),
  // 'HH:MM' => scheduled; undefined => inmediata (ASAP)
  due_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
});

/** Admin raises a one-off task on a running shift. */
export async function createAdHocTask(input: {
  shift_instance_id: string;
  title: string;
  instructions?: string;
  assigned_to?: string;
  due_time?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };

  const { supabase, user } = await requireAdmin();

  // Look up restaurant_id from the shift (same pattern as submitNovedad) so the
  // not-null + RLS check are satisfied without trusting the client.
  const { data: shift } = await supabase
    .from("shift_instances")
    .select("restaurant_id, date")
    .eq("id", parsed.data.shift_instance_id)
    .single();
  if (!shift) return { ok: false, error: "Turno no encontrado." };

  const { error } = await supabase.from("ad_hoc_tasks").insert({
    shift_instance_id: parsed.data.shift_instance_id,
    restaurant_id: shift.restaurant_id,
    title: parsed.data.title,
    instructions: parsed.data.instructions || null,
    assigned_to: parsed.data.assigned_to || null,
    created_by: user.id,
    due_time: parsed.data.due_time ? `${parsed.data.due_time}:00` : null,
    status: "pending",
  });
  if (error) {
    console.error("[createAdHocTask] insert failed:", error);
    return { ok: false, error: "No se pudo crear la tarea." };
  }

  revalidatePath(`/hoy/${shift.date}`);
  revalidatePath(`/shift/${parsed.data.shift_instance_id}`);
  revalidatePath("/turno");
  return { ok: true };
}

const CancelSchema = z.object({ id: z.string().uuid() });

/** Admin cancels an ad-hoc task (soft — keeps the record for the bitácora). */
export async function cancelAdHocTask(input: {
  id: string;
}): Promise<{ ok: boolean; error?: string }> {
  const parsed = CancelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };

  const { supabase } = await requireAdmin();

  const { data: row, error } = await supabase
    .from("ad_hoc_tasks")
    .update({ status: "cancelled" })
    .eq("id", parsed.data.id)
    .select("shift_instance_id")
    .single();
  if (error || !row) return { ok: false, error: "No se pudo cancelar." };

  revalidatePath(`/shift/${row.shift_instance_id}`);
  revalidatePath("/turno");
  return { ok: true };
}
