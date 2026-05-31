"use server";

import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ROOT_HOST } from "@/lib/tenant";
import { removeProjectDomain } from "@/lib/vercel-domains";

// deleteTenant result (documented — `"use server"` files only export async fns):
//   { ok: true } | { error: string }

/**
 * Permanently delete the caller's organization (tenant) and everything under
 * it. Guarded by a typed confirmation matching the org's subdomain slug (or
 * name, pre-onboarding). Detaches the `<slug>.<root>` domain from Vercel first,
 * then cascades the org delete and removes the auth users.
 */
export async function deleteTenant(confirm: string) {
  const { profile, supabase } = await requireAdmin();

  const { data: org } = await supabase
    .from("organizations")
    .select("name, slug")
    .eq("id", profile.organization_id)
    .single<{ name: string; slug: string | null }>();
  if (!org) return { error: "No se encontró la organización." };

  const expected = org.slug ?? org.name;
  if (confirm.trim() !== expected) {
    return { error: "El texto de confirmación no coincide." };
  }

  // User ids to remove from auth after the org (and its profiles) are gone.
  const { data: members } = await supabase
    .from("profiles")
    .select("id")
    .eq("organization_id", profile.organization_id);
  const userIds = (members ?? []).map((m) => (m as { id: string }).id);

  // Detach the subdomain from Vercel (best-effort — don't block deletion).
  if (org.slug) {
    const r = await removeProjectDomain(`${org.slug}.${ROOT_HOST}`);
    if (!r.ok) {
      console.error(
        `[delete-tenant] domain removal failed for ${org.slug}.${ROOT_HOST}: ${r.error}`,
      );
    }
  }

  // Service-role client: org has no RLS delete policy, and we also need to
  // remove auth users. Only ever the caller's own org (from requireAdmin).
  const admin = createSupabaseAdminClient();

  // Deleting the org cascades restaurants, templates, shifts, productos, and
  // profiles (all FK ON DELETE CASCADE to organization).
  const { error: delErr } = await admin
    .from("organizations")
    .delete()
    .eq("id", profile.organization_id);
  if (delErr) return { error: delErr.message };

  // Remove the auth users (their profiles were just cascade-deleted).
  await Promise.all(
    userIds.map((id) => admin.auth.admin.deleteUser(id).catch(() => undefined)),
  );

  // Clear the caller's (now-invalid) session cookies.
  await supabase.auth.signOut();
  return { ok: true as const };
}
