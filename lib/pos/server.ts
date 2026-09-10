import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPosCatalog } from "./catalog";
import { getPosDeviceFromCookie, type PosDevice } from "./devices";
import type { PosCatalog } from "./types";

/**
 * Who is driving the terminal. Two paths:
 *   · `device` — a tablet paired with a registration code (no user session);
 *     runs with the service-role client scoped by hand to the device's org.
 *   · `user`   — a signed-in org member opening /pos from their account;
 *     runs with the RLS-scoped client exactly as before.
 */
export type PosActor =
  | { kind: "device"; device: PosDevice }
  | { kind: "user"; profileId: string; restaurantId: string | null };

export type PosContext = {
  catalog: PosCatalog;
  supabase: SupabaseClient;
  organizationId: string;
  actor: PosActor;
  /** Label for the terminal header ("Caja 2" · "Cajero"). */
  station: string;
};

/**
 * Resolve the POS context, preferring a paired device over a user session.
 * Returns null when neither exists — the page then shows the pairing screen.
 * Server actions should call `requirePosContext()` instead.
 */
export async function loadPosContext(): Promise<PosContext | null> {
  const device = await getPosDeviceFromCookie();
  if (device) {
    const admin = createSupabaseAdminClient();
    const catalog = await getPosCatalog({
      organizationId: device.organizationId,
      userId: null,
      orgName: device.orgName,
      client: admin,
    });
    return {
      catalog,
      supabase: admin,
      organizationId: device.organizationId,
      actor: { kind: "device", device },
      station: device.name,
    };
  }

  // No device → fall back to a signed-in user, without redirecting (the page
  // decides what to render when there's nobody).
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return loadUserPosContext();
}

/** Same as loadPosContext but for server actions: no context → throws. */
export async function requirePosContext(): Promise<PosContext> {
  const device = await getPosDeviceFromCookie();
  if (device) {
    const ctx = await loadPosContext();
    if (ctx) return ctx;
  }
  return loadUserPosContext();
}

async function loadUserPosContext(): Promise<PosContext> {
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

  const restaurantId = await resolvePosSede(
    supabase,
    profile.organization_id,
    profile.id,
  );

  return {
    catalog,
    supabase,
    organizationId: profile.organization_id,
    actor: { kind: "user", profileId: profile.id, restaurantId },
    station: "Caja 01",
  };
}

/** True when there is a signed-in user (any org state). Used by the page only. */
export async function hasUserSession(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return !!user;
}

/**
 * Best-effort sede for a user-driven POS order: the user's first restaurant
 * membership, else the org's first restaurant, else null.
 */
export async function resolvePosSede(
  supabase: SupabaseClient,
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
