"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Result shape (kept un-exported — `"use server"` files can only export
// async functions in Next 16):
//   { ok: boolean; error?: string }

const Schema = z.object({
  restaurant_id: z.string().uuid(),
  confirm_name: z.string().min(1).max(120),
});

/**
 * Delete a restaurant and every operational row that hangs off it.
 *
 * What gets removed (via Postgres cascade from the `restaurants` row):
 *   - restaurant_members (the entire team's access — Auth users themselves
 *     remain so they can still be reassigned to other restaurants)
 *   - checklist_templates + template_tasks
 *   - shift_instances + task_completions
 *   - novedades
 *
 * Plus best-effort storage cleanup: every `task-photos/<restaurant_id>/...`
 * blob. Storage failures don't block the DB delete — orphan photos are
 * easier to clean up later than a half-deleted restaurant.
 *
 * Safety: the action requires the caller to type the restaurant's name
 * exactly. RLS still gates the DELETE (admin in the same org), so a
 * tampered URL can't blow up another tenant's data.
 */
export async function deleteRestaurant(
  _prev: { ok: boolean; error?: string } | null,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = Schema.safeParse({
    restaurant_id: formData.get("restaurant_id"),
    confirm_name: formData.get("confirm_name"),
  });
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };

  const { supabase } = await requireAdmin();

  // Look up the restaurant in the admin's org. RLS will return null for
  // anything outside it.
  const { data: rest, error: rErr } = await supabase
    .from("restaurants")
    .select("id, name")
    .eq("id", parsed.data.restaurant_id)
    .single();
  if (rErr || !rest) {
    return { ok: false, error: "Restaurante no encontrado." };
  }
  if (parsed.data.confirm_name.trim() !== rest.name) {
    return {
      ok: false,
      error: "El nombre escrito no coincide con el del restaurante.",
    };
  }

  // Best-effort photo cleanup. Storage folders mirror DB ids:
  //   task-photos/<restaurant_id>/<shift_instance_id>/<task_id>-<rand>.jpg
  const adminDb = createSupabaseAdminClient();
  try {
    await purgePhotos(adminDb, rest.id);
  } catch (e) {
    console.error("[deleteRestaurant] photo purge failed:", e);
    // continue anyway
  }

  const { error: delErr } = await supabase
    .from("restaurants")
    .delete()
    .eq("id", rest.id);
  if (delErr) {
    console.error("[deleteRestaurant] delete failed:", delErr);
    return {
      ok: false,
      error: delErr.message ?? "No se pudo eliminar el restaurante.",
    };
  }

  // Drop the deleted sede from the (admin) sidebar list and the
  // /restaurants index on next navigation.
  revalidatePath("/", "layout");

  return { ok: true };
}

/**
 * Recursively list and delete every object under `<restaurant_id>/` in the
 * task-photos bucket. Supabase storage's list() is non-recursive — we walk
 * the shift-id subfolders explicitly.
 */
async function purgePhotos(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminDb: any,
  restaurantId: string,
) {
  const bucket = adminDb.storage.from("task-photos");
  const { data: shiftFolders, error } = await bucket.list(restaurantId, {
    limit: 1000,
  });
  if (error) throw error;

  const toDelete: string[] = [];
  for (const folder of shiftFolders ?? []) {
    const { data: files, error: e2 } = await bucket.list(
      `${restaurantId}/${folder.name}`,
      { limit: 1000 },
    );
    if (e2) throw e2;
    for (const f of files ?? []) toDelete.push(`${restaurantId}/${folder.name}/${f.name}`);
  }

  if (toDelete.length === 0) return;
  const { error: rmErr } = await bucket.remove(toDelete);
  if (rmErr) throw rmErr;
}
