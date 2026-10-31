import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/auth";
import { resolvePersonInOrg, type PersonRole } from "@/lib/auth-person";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPosCatalog } from "./catalog";
import { getPosDeviceFromCookie, type PosDevice } from "./devices";
import type { PosCatalog } from "./types";

/** The person in session on a paired register, validated against the device's org. */
export type PosPerson = { profileId: string; fullName: string; role: PersonRole };

/**
 * Who is driving the terminal. Two paths:
 *   · `device` — a tablet/PC paired with a registration code. The device only
 *     fixes the org/sede; `person` is the user signed in on it (the single
 *     login at /login), or null when nobody is — the page then sends the
 *     register to /login, so a sale from the UI always has a person. Server
 *     actions still accept a null person: an offline sale replayed after the
 *     session expired is authorised by the device and attributed through the
 *     `creadoPor` the register stamped on it. Runs with the service-role
 *     client scoped by hand to the device's org.
 *   · `user`   — a signed-in org member opening /pos from their account on an
 *     unpaired device; runs with the RLS-scoped client exactly as before.
 */
export type PosActor =
  | { kind: "device"; device: PosDevice; person: PosPerson | null }
  | { kind: "user"; profileId: string; restaurantId: string | null };

export type PosContext = {
  catalog: PosCatalog;
  supabase: SupabaseClient;
  organizationId: string;
  actor: PosActor;
  /** Label for the terminal header ("Caja 2" · "Cajero"). */
  station: string;
  /** Paired device with nobody (valid) in session: the page must ask who is selling. */
  requiresPerson: boolean;
  /** …and somebody *is* signed in, but is not a member of this device's org. */
  wrongPerson: boolean;
  /** Who is selling: the person on the paired device, or the account itself. */
  person: PosPerson | null;
};

async function sessionUserId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** The person signed in on a paired device, if they belong to its org. */
async function devicePerson(admin: SupabaseClient, device: PosDevice, userId: string | null): Promise<PosPerson | null> {
  if (!userId) return null;
  return resolvePersonInOrg(admin, userId, device.organizationId);
}

/**
 * Resolve the POS context, preferring a paired device over a user session.
 * Returns null when neither exists — the page then sends the visitor to
 * /login. Server actions should call `requirePosContext()` instead.
 */
export async function loadPosContext(): Promise<PosContext | null> {
  const [device, userId] = await Promise.all([getPosDeviceFromCookie(), sessionUserId()]);
  if (device) {
    const admin = createSupabaseAdminClient();
    const [catalog, person] = await Promise.all([
      getPosCatalog({
        organizationId: device.organizationId,
        userId: null,
        orgName: device.orgName,
        client: admin,
      }),
      devicePerson(admin, device, userId),
    ]);
    return {
      catalog,
      supabase: admin,
      organizationId: device.organizationId,
      actor: { kind: "device", device, person },
      station: device.name,
      requiresPerson: !person,
      wrongPerson: !person && !!userId,
      person,
    };
  }

  // No device → fall back to a signed-in user, without redirecting (the page
  // decides what to do when there's nobody).
  if (!userId) return null;
  return loadUserPosContext();
}

/** Same as loadPosContext but for server actions: no context → throws. */
export async function requirePosContext(): Promise<PosContext> {
  const ctx = await loadPosContext();
  if (ctx) return ctx;
  return loadUserPosContext();
}

/** The context minus the catalog (and the page-only flags). */
export type PosAuth = Omit<PosContext, "catalog" | "requiresPerson" | "wrongPerson" | "person">;

/**
 * Who is calling, without building the catalog. Listing, charging,
 * cancelling and combining orders never price anything, and the catalog is
 * eight queries — building it on every one of those calls was most of the
 * latency the register felt. The session lookup runs in parallel with the
 * device lookup; resolving the person adds one round-trip only when someone
 * is signed in on the device.
 */
export async function requirePosAuth(): Promise<PosAuth> {
  const [device, userId] = await Promise.all([getPosDeviceFromCookie(), sessionUserId()]);
  if (device) {
    const admin = createSupabaseAdminClient();
    const person = await devicePerson(admin, device, userId);
    return {
      supabase: admin,
      organizationId: device.organizationId,
      actor: { kind: "device", device, person },
      station: device.name,
    };
  }
  return loadUserPosAuth();
}

async function loadUserPosAuth(): Promise<PosAuth> {
  return (await loadUserPos()).auth;
}

async function loadUserPos(): Promise<{ auth: PosAuth; person: PosPerson }> {
  const { profile, supabase } = await requireUser();
  const restaurantId = await resolvePosSede(supabase, profile.organization_id, profile.id);
  return {
    auth: {
      supabase,
      organizationId: profile.organization_id,
      actor: { kind: "user", profileId: profile.id, restaurantId },
      station: "Caja 01",
    },
    person: { profileId: profile.id, fullName: profile.full_name ?? "", role: profile.role === "admin" ? "admin" : "staff" },
  };
}

async function loadUserPosContext(): Promise<PosContext> {
  const { auth, person } = await loadUserPos();
  const { data: org } = await auth.supabase
    .from("organizations")
    .select("name")
    .eq("id", auth.organizationId)
    .maybeSingle();
  const catalog = await getPosCatalog({
    organizationId: auth.organizationId,
    userId: auth.actor.kind === "user" ? auth.actor.profileId : null,
    orgName: (org?.name as string | undefined) ?? "comanda",
  });
  return { ...auth, catalog, requiresPerson: false, wrongPerson: false, person };
}

/** True when there is a signed-in user (any org state). Used by the page only. */
export async function hasUserSession(): Promise<boolean> {
  return !!(await sessionUserId());
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
