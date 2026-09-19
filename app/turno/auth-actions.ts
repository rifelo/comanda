"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Tablet sign-in. Runs in a Server Action so `cookies().set` works and the
 * Supabase session cookies land on the response (the `setAll` in
 * lib/supabase/server.ts only swallows inside Server Components). No
 * redirect here: the client calls `router.refresh()` and `/turno` re-renders
 * through `loadTurnoGate()` — the same pattern as the POS pairing screen.
 */
const LoginSchema = z.object({
  email: z.string().trim().email().max(160),
  password: z.string().min(1).max(72),
});

export async function signInTurno(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = LoginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Escribe tu correo y tu contraseña." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("invalid login")) return { ok: false, error: "Correo o contraseña incorrectos." };
    if (msg.includes("not confirmed")) return { ok: false, error: "La cuenta no está activada. Pídele al administrador que la active." };
    if (msg.includes("rate limit") || msg.includes("too many")) return { ok: false, error: "Demasiados intentos. Espera un minuto." };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Sign out only *this* tablet. `scope: "local"` — the default "global"
 * would also revoke the owner's laptop session when they sign in here with
 * the same account.
 */
export async function signOutTurno(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/turno");
}
