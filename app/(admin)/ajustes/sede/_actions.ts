"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";

// updateSede result (documented for callers — `"use server"` files can only
// export async functions):
//   { ok: true } | { error: string }

const Schema = z.object({
  name: z.string().min(1).max(120),
  logo_url: z.string().nullable(),
  timezone: z.string().min(1).max(60),
  currency: z.string().min(1).max(10),
});

export async function updateSede(input: z.infer<typeof Schema>) {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { error: "Datos inválidos." };

  const sede = await getActiveSede();
  if (!sede) return { error: "Sin sede activa." };

  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("restaurants")
    .update({
      name: parsed.data.name.trim(),
      logo_url: parsed.data.logo_url,
      timezone: parsed.data.timezone.trim(),
      currency: parsed.data.currency.trim(),
    })
    .eq("id", sede.id);
  if (error) return { error: error.message };

  // Sidebar footer is part of the root layout — revalidate from root.
  revalidatePath("/", "layout");
  return { ok: true };
}
