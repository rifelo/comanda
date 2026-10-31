"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPosDeviceFromCookie } from "@/lib/pos/devices";
import { landingFor, listRosterForSede, type PersonRole } from "@/lib/auth-person";

/**
 * The single login (/login). Two ways in, both through the auth provider's
 * own password check (`supabase.auth.signInWithPassword` — Supabase in prod,
 * the Better Auth shim on Neon):
 *   · `signInAsMember` — on a paired device: the person taps their tile and
 *     types their password. The tile carries a profile id, never an email,
 *     and only ids on this sede's roster are accepted.
 *   · `signInWithPassword` — anywhere: email + password.
 * Both land with `landingFor` (lib/auth-person.ts). Google stays client-side
 * (GoogleSignInButton) and comes back through `/` or `next`.
 */

export type LoginState = { error: string } | null;

const MSG = {
  wrong: "Contraseña incorrecta.",
  wrongEmail: "Correo o contraseña incorrectos.",
  google: "Esta cuenta entra con Google; toca «Entrar con Google».",
  rate: "Demasiados intentos. Espera un minuto.",
  notConfirmed: "La cuenta no está activada. Pídele al administrador que la active.",
  pick: "Toca tu nombre y escribe tu contraseña.",
  notOnTeam: "Esa persona no está en el equipo de esta sede.",
  unpaired: "Este dispositivo ya no está emparejado. Entra con tu correo.",
  generic: "No se pudo entrar. Intenta otra vez.",
};

type AuthErr = { message: string; code?: string; status?: number } | null;

function classify(error: NonNullable<AuthErr>): "rate" | "invalid" | "not_confirmed" | "other" {
  const msg = `${error.code ?? ""} ${error.message}`.toLowerCase();
  if (error.status === 429 || msg.includes("rate limit") || msg.includes("too many")) return "rate";
  if (msg.includes("invalid login") || msg.includes("invalid_credentials")) return "invalid";
  if (msg.includes("not confirmed")) return "not_confirmed";
  return "other";
}

const MemberSchema = z.object({
  profileId: z.string().uuid(),
  password: z.string().min(1).max(72),
  next: z.string().max(300).optional(),
});

/** Tile + password on a paired device (tablet / register). */
export async function signInAsMember(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = MemberSchema.safeParse({
    profileId: formData.get("profileId") ?? "",
    password: formData.get("password") ?? "",
    next: formData.get("next") || undefined,
  });
  if (!parsed.success) return { error: MSG.pick };
  const { profileId, password, next } = parsed.data;

  const device = await getPosDeviceFromCookie();
  if (!device) return { error: MSG.unpaired };

  const admin = createSupabaseAdminClient();
  // Never accept an arbitrary id: it must be on this sede's roster.
  const roster = await listRosterForSede(admin, device.organizationId, device.restaurantId);
  const member = roster.find((p) => p.id === profileId);
  if (!member) return { error: MSG.notOnTeam };

  const { data: found, error: lookupErr } = await admin.auth.admin.getUserById(profileId);
  const email = found?.user?.email;
  if (lookupErr || !email) {
    console.error("[signInAsMember] getUserById failed:", lookupErr?.message);
    return { error: MSG.generic };
  }
  const providers = ((found.user.app_metadata as { providers?: unknown } | undefined)?.providers ?? []) as string[];

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const kind = classify(error);
    if (kind === "rate") return { error: MSG.rate };
    if (kind === "not_confirmed") return { error: MSG.notConfirmed };
    if (kind === "invalid") {
      // Known providers and none of them is a password → a Google-only account.
      const googleOnly = Array.isArray(providers) && providers.length > 0 && !providers.includes("email");
      return { error: googleOnly ? MSG.google : MSG.wrong };
    }
    console.error("[signInAsMember]", error.message);
    return { error: MSG.generic };
  }
  redirect(landingFor(member.role, true, next));
}

/**
 * Email + password (form action for `PasswordForm`). Returns the error to
 * display, or `redirect()`s on success: `next` if it is a safe relative
 * path, else the person's home (`landingFor`).
 */
export async function signInWithPassword(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");
  if (!email || !password) return { error: "Escribe tu correo y tu contraseña." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const kind = classify(error);
    if (kind === "invalid") return { error: MSG.wrongEmail };
    if (kind === "not_confirmed") return { error: MSG.notConfirmed };
    if (kind === "rate") return { error: MSG.rate };
    return { error: error.message };
  }

  const userId = data.user?.id;
  const [device, profile] = await Promise.all([
    getPosDeviceFromCookie(),
    userId
      ? createSupabaseAdminClient().from("profiles").select("role").eq("id", userId).maybeSingle<{ role: PersonRole | null }>()
      : Promise.resolve({ data: null }),
  ]);
  const role: PersonRole = profile.data?.role === "admin" ? "admin" : "staff";
  redirect(landingFor(role, !!device, next));
}

/** Sign out everywhere (panel «Salir»). */
export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * «Cambiar persona» / «Salir de la tablet»: ends only *this* session —
 * `scope: "local"` on Supabase (the default "global" would also sign the
 * owner out of their phone); on Better Auth `signOut` revokes only the
 * current session. The device pairing (its own cookie) is untouched, so on a
 * paired device the next screen is the team's tiles.
 */
export async function signOutLocal(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}
