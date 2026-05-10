"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";

// Result: { ok: boolean; error?: string }

const Schema = z.object({
  restaurant_id: z.string().uuid(),
  user_id: z.string().uuid(),
});

/**
 * Revoke a staff member's access to a restaurant by deleting their
 * `restaurant_members(user_id, restaurant_id)` row.
 *
 * Does NOT delete the Auth user or their profile — they may still be on
 * other restaurants in the org, and even if they're not, keeping the
 * profile preserves their authorship on past task_completions / novedades.
 */
export async function removeStaffMember(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = Schema.safeParse({
    restaurant_id: formData.get("restaurant_id"),
    user_id: formData.get("user_id"),
  });
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };

  const { supabase } = await requireAdmin();

  // RLS policy `members admin write` enforces same-org + admin role, so we
  // don't need a separate ownership check here — a wrong-org delete affects
  // zero rows and we report success either way.
  const { error } = await supabase
    .from("restaurant_members")
    .delete()
    .eq("restaurant_id", parsed.data.restaurant_id)
    .eq("user_id", parsed.data.user_id);

  if (error) {
    console.error("[removeStaffMember] delete failed:", error);
    return { ok: false, error: "No se pudo quitar al miembro." };
  }

  revalidatePath(`/restaurants/${parsed.data.restaurant_id}`);
  return { ok: true };
}
