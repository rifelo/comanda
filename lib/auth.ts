import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

/**
 * Get current user + profile (with a possibly-null `organization_id`), or
 * redirect to /login. Unlike `requireUser`, this does NOT bounce a no-org user
 * to the selector — it's the entry point for `/organizaciones` and its actions,
 * which must run while the user has no active org yet.
 */
export async function getUserAndProfile() {
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
    // Profile row missing — the handle_new_user trigger should have created
    // one. Treat as auth failure to avoid infinite loops.
    await supabase.auth.signOut();
    redirect("/login");
  }
  return { user, profile, supabase };
}

/**
 * Get current user + profile, or redirect to /login. A user without an active
 * org is bounced to `/organizaciones` to pick or create one. The returned
 * profile is narrowed so `organization_id` is `string`, keeping the ~dozen
 * existing org-scoped call sites type-safe without changes.
 */
export async function requireUser() {
  const ctx = await getUserAndProfile();
  if (!ctx.profile.organization_id) redirect("/organizaciones");
  return {
    ...ctx,
    profile: ctx.profile as Profile & { organization_id: string },
  };
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
