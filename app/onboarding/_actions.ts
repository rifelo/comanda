"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isValidSlug, RESERVED_SUBDOMAINS, ROOT_HOST, SLUG_RE } from "@/lib/tenant";
import { addProjectDomain } from "@/lib/vercel-domains";

// Result shapes (documented — `"use server"` files only export async fns):
//   checkSlug          → { available: boolean; reason?: string }
//   completeOnboarding → { ok: true; slug: string } | { error: string }

const CompleteSchema = z.object({
  slug: z.string().regex(SLUG_RE),
  restaurantName: z.string().min(1).max(120),
  timezone: z.string().min(1).max(60),
});

/** Normalize free text toward a valid slug (used server- and client-side). */
function normalizeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

/** Live availability check for the onboarding form (format + reserved + taken). */
export async function checkSlug(
  slug: string,
): Promise<{ available: boolean; reason?: string }> {
  const s = normalizeSlug(slug);
  if (!isValidSlug(s)) {
    return { available: false, reason: "3–32 caracteres: letras, números y guiones." };
  }
  if (RESERVED_SUBDOMAINS.has(s)) {
    return { available: false, reason: "Ese subdominio está reservado." };
  }
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("org_id_for_slug", { p_slug: s });
  if (data) return { available: false, reason: "Ya está en uso." };
  return { available: true };
}

/**
 * Claim the tenant subdomain + create the org's first restaurant. Idempotent:
 * if the org already has a slug we just return it. The DB UNIQUE constraint is
 * the real race guard (23505 → friendly message).
 */
export async function completeOnboarding(input: z.infer<typeof CompleteSchema>) {
  const parsed = CompleteSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos inválidos." };

  const slug = normalizeSlug(parsed.data.slug);
  if (!isValidSlug(slug)) return { error: "Subdominio inválido." };
  if (RESERVED_SUBDOMAINS.has(slug)) {
    return { error: "Ese subdominio está reservado." };
  }

  const { profile, supabase } = await requireAdmin();

  // Already onboarded → idempotent success.
  const { data: org } = await supabase
    .from("organizations")
    .select("slug")
    .eq("id", profile.organization_id)
    .single<{ slug: string | null }>();
  if (org?.slug) return { ok: true as const, slug: org.slug };

  // Claim the slug.
  const { error: slugErr } = await supabase
    .from("organizations")
    .update({ slug, onboarded_at: new Date().toISOString() })
    .eq("id", profile.organization_id);
  if (slugErr) {
    if (slugErr.code === "23505") {
      return { error: "Ese subdominio ya está en uso." };
    }
    return { error: slugErr.message };
  }

  // Create the first restaurant if the org doesn't have one yet.
  const { data: existing } = await supabase
    .from("restaurants")
    .select("id")
    .eq("organization_id", profile.organization_id)
    .limit(1);
  if (!existing || existing.length === 0) {
    const { error: rErr } = await supabase.from("restaurants").insert({
      organization_id: profile.organization_id,
      name: parsed.data.restaurantName.trim(),
      timezone: parsed.data.timezone.trim(),
    });
    if (rErr) return { error: rErr.message };
  }

  // Provision the subdomain on Vercel so it gets a TLS cert (HTTP-01 per host;
  // the domain is on Cloudflare Registrar, so a wildcard cert isn't possible).
  // Best-effort: the slug is already claimed, so don't fail onboarding on a
  // provisioning hiccup — it can be re-added from the Vercel dashboard.
  const prov = await addProjectDomain(`${slug}.${ROOT_HOST}`);
  if (!prov.ok) {
    console.error(
      `[onboarding] Vercel domain provisioning failed for ${slug}.${ROOT_HOST}: ${prov.error}`,
    );
  }

  revalidatePath("/", "layout");
  return { ok: true as const, slug };
}
