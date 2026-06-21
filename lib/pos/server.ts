import "server-only";
import { requireUser } from "@/lib/auth";
import { getPosCatalog } from "./catalog";
import type { PosCatalog } from "./types";

/**
 * Load the live POS catalog for the calling user (gated by requireUser), along
 * with the org name for the terminal header. Shared by the /pos page and the
 * POS server actions so both ground on the exact same data.
 */
export async function loadPosCatalog(): Promise<{
  catalog: PosCatalog;
  profile: Awaited<ReturnType<typeof requireUser>>["profile"];
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"];
}> {
  const { profile, supabase } = await requireUser();

  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", profile.organization_id)
    .maybeSingle();

  const catalog = await getPosCatalog({
    organizationId: profile.organization_id,
    userId: profile.id,
    orgName: (org?.name as string | undefined) ?? "comanda",
  });

  return { catalog, profile, supabase };
}

/**
 * Best-effort sede for a POS order: the user's first restaurant membership,
 * else the org's first restaurant, else null (ordenes.restaurant_id is
 * nullable).
 */
export async function resolvePosSede(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  organizationId: string,
  userId: string,
): Promise<string | null> {
  const { data: membership } = await supabase
    .from("restaurant_members")
    .select("restaurant_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (membership?.restaurant_id) return membership.restaurant_id as string;

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id")
    .eq("organization_id", organizationId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return (restaurant?.id as string | undefined) ?? null;
}
