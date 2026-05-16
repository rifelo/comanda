"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";

const Schema = z.object({
  name: z.string().min(1).max(120),
  timezone: z.string().min(1).max(80),
});

// NOTE: `"use server"` files in Next 16 must only export async functions —
// type exports get stripped at compile time, but exporting an `interface`
// (even type-only) trips the RSC payload encoder and surfaces as
// "An unexpected response was received from the server" at page load.
// The result shape is documented here for reference but kept un-exported.
//   type CreateRestaurantResult = { ok: boolean; id?: string; error?: string }

export async function createRestaurant(
  _prev: { ok: boolean; id?: string; error?: string } | null,
  formData: FormData,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const parsed = Schema.safeParse({
    name: formData.get("name"),
    timezone: formData.get("timezone"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Datos inválidos. Revisa los campos." };
  }

  const { profile, supabase } = await requireAdmin();

  const { data: restaurant, error: rErr } = await supabase
    .from("restaurants")
    .insert({
      organization_id: profile.organization_id,
      name: parsed.data.name,
      timezone: parsed.data.timezone,
    })
    .select()
    .single();
  if (rErr || !restaurant) {
    console.error("[createRestaurant] insert failed:", rErr);
    return {
      ok: false,
      error: rErr?.message ?? "No se pudo crear el restaurante.",
    };
  }

  // Templates are created on demand from the restaurant page — admins
  // know their own operation better than any seeded default. The cron job
  // will simply have no `active=true` templates to materialise shifts
  // from until the admin adds one.

  // Bust the (admin) layout cache so the sidebar's Sedes list (and the
  // "X sedes" footer count) include the new restaurant on next navigation.
  // The layout fetches at its own segment, so revalidating from the root
  // layout down is the simplest way to invalidate every cached admin path.
  revalidatePath("/", "layout");

  return { ok: true, id: restaurant.id };
}
