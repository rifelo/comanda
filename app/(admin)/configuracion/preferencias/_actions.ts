"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";

// setTheme result (documented — `"use server"` files cannot export type-only
// declarations):  { ok: true } | { error: string }

const Schema = z.object({
  theme: z.enum(["papel", "sepia", "carbon", "indigo", "rojo"]),
});

/**
 * Set the platform theme cookie (1-year expiry) and persist on the sede so
 * a new browser loads the user's preferred theme on first paint. The
 * `revalidatePath("/", "layout")` purge re-renders the root layout — that's
 * where the `<html data-theme>` attribute lives.
 */
export async function setTheme(input: z.infer<typeof Schema>) {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { error: "Tema inválido." };

  await requireAdmin();
  const sede = await getActiveSede();

  const cookieStore = await cookies();
  cookieStore.set("comanda-theme", parsed.data.theme, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  if (sede) {
    const { supabase } = await requireAdmin();
    await supabase
      .from("restaurants")
      .update({ theme: parsed.data.theme })
      .eq("id", sede.id);
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
