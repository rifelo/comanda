"use server";

import { z } from "zod";
import { requireAdmin } from "@/lib/auth";

// Result shape (documented, not exported — `"use server"` files can only
// export async functions in Next 16):
//   { ok: boolean; id?: string; error?: string }

const Schema = z.object({
  restaurant_id: z.string().uuid(),
  name: z.string().min(1).max(120),
  shift: z.enum(["day", "night"]),
});

export async function createTemplate(
  _prev: { ok: boolean; id?: string; error?: string } | null,
  formData: FormData,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const parsed = Schema.safeParse({
    restaurant_id: formData.get("restaurant_id"),
    name: formData.get("name"),
    shift: formData.get("shift"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Datos inválidos. Revisa los campos." };
  }

  const { supabase } = await requireAdmin();

  // RLS on `restaurants` already restricts to the admin's org, so a wrong-org
  // id here returns no row and we abort.
  const { data: restaurant, error: rErr } = await supabase
    .from("restaurants")
    .select("id")
    .eq("id", parsed.data.restaurant_id)
    .single();
  if (rErr || !restaurant) {
    return { ok: false, error: "Restaurante no encontrado." };
  }

  const { data: tpl, error } = await supabase
    .from("checklist_templates")
    .insert({
      restaurant_id: parsed.data.restaurant_id,
      name: parsed.data.name,
      shift: parsed.data.shift,
    })
    .select()
    .single();

  if (error || !tpl) {
    console.error("[createTemplate] insert failed:", error);
    return {
      ok: false,
      error: error?.message ?? "No se pudo crear la plantilla.",
    };
  }

  return { ok: true, id: tpl.id };
}
