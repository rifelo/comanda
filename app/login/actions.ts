"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * Email + password sign-in (form action for `PasswordForm`). Returns the
 * error to display, or `redirect()`s to `next` on success. Same `next`
 * hygiene as the OAuth callback: relative paths only.
 */
export async function signInWithPassword(
  _prev: { error: string } | null,
  formData: FormData,
): Promise<{ error: string } | null> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");
  if (!email || !password) return { error: "Escribe tu correo y tu contraseña." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("invalid login")) return { error: "Correo o contraseña incorrectos." };
    if (msg.includes("not confirmed")) return { error: "La cuenta no está activada. Pídele al administrador que la active." };
    return { error: error.message };
  }
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/organizaciones");
}
