"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";

const AjusteSchema = z.object({
  ingrediente_id: z.string().uuid(),
  delta: z.coerce.number().refine((n) => n !== 0, "El ajuste no puede ser 0."),
  note: z.string().max(500).optional(),
});

/**
 * Manual stock adjustment from the Movimientos view. Inserts a signed
 * `ajuste` movement; the BEFORE INSERT trigger updates stock_current and
 * stamps balance_after, so we never write stock directly.
 */
export async function registrarAjuste(input: unknown) {
  const parsed = AjusteSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const { user, profile, supabase } = await requireAdmin();

  const { error } = await supabase.from("ingrediente_movements").insert({
    organization_id: profile.organization_id,
    ingrediente_id: parsed.data.ingrediente_id,
    type: "ajuste",
    delta: parsed.data.delta,
    note: parsed.data.note?.trim() || "Ajuste manual",
    created_by: user.id,
  });
  if (error) {
    // The trigger raises on insufficient stock — surface that to the user.
    if (/insufficient stock/i.test(error.message))
      return { error: "Stock insuficiente para ese ajuste." };
    return { error: error.message };
  }

  revalidatePath("/historial");
  revalidatePath("/inventario");
  return { ok: true };
}
