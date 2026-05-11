import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

/** Get current user + profile, or redirect to /login. */
export async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

  if (error || !profile) {
    // Profile row missing — sign-out trigger should have created one.
    // Treat as auth failure to avoid infinite loops.
    await supabase.auth.signOut();
    redirect("/login");
  }
  return { user, profile, supabase };
}

/** Same as requireUser but also enforces role === 'admin'. */
export async function requireAdmin() {
  const ctx = await requireUser();
  if (ctx.profile.role !== "admin") redirect("/");
  return ctx;
}

/**
 * How many `restaurant_members` rows the current user owns. Used by the
 * admin layout to decide whether to show a "Mi turno" entry (admin who's
 * also a member of at least one sede) and could be reused by future flows.
 * Returns 0 when there's no authenticated user.
 */
export async function getMembershipCount(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;
  const { count } = await supabase
    .from("restaurant_members")
    .select("user_id", { count: "exact", head: true })
    .eq("user_id", user.id);
  return count ?? 0;
}
