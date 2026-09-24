"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";

// Owner's review of a cash close (caja_cierres, 0037). Approving moves no
// money — the row is the record — so both actions are the same guarded
// update with a different status; the `pendiente` guard makes a double tap
// harmless.

export type CierreActionResult = { ok: true } | { ok: false; error: string };

const IdSchema = z.object({ id: z.string().uuid(), note: z.string().trim().max(300).optional() });

async function review(input: unknown, status: "aprobado" | "rechazado"): Promise<CierreActionResult> {
  const parsed = IdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Cierre inválido." };
  const { user, profile, supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from("caja_cierres")
    .update({ status, reviewed_by: user.id, reviewed_at: new Date().toISOString(), review_note: parsed.data.note || null })
    .eq("id", parsed.data.id)
    .eq("organization_id", profile.organization_id)
    .eq("status", "pendiente")
    .select("id, shift:shift_instances(date)");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Este cierre ya fue revisado." };
  const shift = (data[0] as { shift?: { date: string } | { date: string }[] | null }).shift;
  const date = Array.isArray(shift) ? shift[0]?.date : shift?.date;
  revalidatePath("/hoy");
  if (date) revalidatePath(`/hoy/${date}`);
  revalidatePath("/turno/caja");
  return { ok: true };
}

export async function aprobarCierre(input: unknown): Promise<CierreActionResult> {
  return review(input, "aprobado");
}

/** Reject (the tablet then allows a new count); the note tells the team why. */
export async function rechazarCierre(input: unknown): Promise<CierreActionResult> {
  return review(input, "rechazado");
}
