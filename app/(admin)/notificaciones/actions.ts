"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";

const MinSchema = z.object({
  ingrediente_id: z.string().uuid(),
  stock_min: z.coerce.number().min(0).max(1_000_000),
});

/**
 * Set the reorder threshold (stock_min) for an ingrediente from the
 * Notificaciones view. A threshold of 0 disables the low-stock alert.
 */
export async function updateStockMin(input: unknown) {
  const parsed = MinSchema.safeParse(input);
  if (!parsed.success) return { error: "Umbral inválido." };
  const { profile, supabase } = await requireAdmin();

  const { error } = await supabase
    .from("ingredientes")
    .update({ stock_min: parsed.data.stock_min })
    .eq("id", parsed.data.ingrediente_id)
    .eq("organization_id", profile.organization_id);
  if (error) return { error: error.message };

  revalidatePath("/notificaciones");
  revalidatePath("/inventario");
  return { ok: true };
}
