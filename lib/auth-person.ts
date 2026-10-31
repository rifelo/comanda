import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Who the person behind a device is — shared by the single login (/login),
 * the shift tablet (/turno) and the register (/pos).
 *
 * The paired device (cookie `comanda_pos_device`) only says *which sede*; the
 * *person* is always a real user session. These helpers resolve and validate
 * that person against the device's org. Everything here takes the client as
 * an argument (no `server-only`, no cookies), so the pure parts are unit-tested
 * in `auth-person.test.ts`.
 */

export type PersonRole = "admin" | "staff";

/** A member as the tablet / login shows them (name + initials tile). */
export interface TurnoPerson {
  id: string;
  name: string;
  initials: string;
  role: PersonRole;
}

/** The signed-in person, validated as a member of an org. */
export interface OrgPerson {
  profileId: string;
  fullName: string;
  role: PersonRole;
}

// ── pure ──────────────────────────────────────────────────────────────────────

/** A post-login target we can trust: relative, not protocol-relative, not back to /login. */
export function safeNext(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  if (next === "/login" || next.startsWith("/login?") || next.startsWith("/login/")) return null;
  return next;
}

/**
 * Where a person lands after signing in.
 *   · a valid `next` wins (deep link, e.g. /pos);
 *   · on a paired device everybody — the owner included — works as the team (/turno);
 *   · otherwise the owner gets the panel (/hoy) and the team the shift app (/turno).
 */
export function landingFor(role: PersonRole, viaDevice: boolean, next?: string | null): string {
  const n = safeNext(next);
  if (n) return n;
  if (viaDevice) return "/turno";
  return role === "admin" ? "/hoy" : "/turno";
}

/** Same initials rule as lib/db/roster `makeInitials` (kept here so this module stays import-light). */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "";
  const b = parts[1]?.[0] ?? parts[0]?.[1] ?? "";
  const base = (a + b).toUpperCase();
  return base.length === 2 ? base : "XX";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `creadoPor` as sent by the register: a uuid or nothing. */
export function parseCreadoPor(v: unknown): string | null {
  return typeof v === "string" && UUID_RE.test(v) ? v.toLowerCase() : null;
}

export type OrderActorLike =
  | { kind: "user"; profileId: string }
  | { kind: "device"; person: { profileId: string } | null };

/**
 * `ordenes.created_by` for a sale.
 *   · signed-in account on its own device (`user`) → that account;
 *   · paired device → the person in session; if the session is gone (an
 *     offline sale replayed later), the `creadoPor` the register stamped at
 *     confirm time — but only when it was verified to be a member of the
 *     device's org (`creadoPorIsMember`); else null.
 */
export function pickCreatedBy(
  actor: OrderActorLike,
  creadoPor: string | null | undefined,
  creadoPorIsMember: boolean,
): string | null {
  if (actor.kind === "user") return actor.profileId;
  if (actor.person) return actor.person.profileId;
  const c = parseCreadoPor(creadoPor);
  return c && creadoPorIsMember ? c : null;
}

/**
 * `ordenes.barista_id`: the barista the cashier picked if they are on the
 * team; when none was picked, the person who made the sale if *they* are on
 * the team (staff preparing their own drinks). Never someone off the team.
 */
export function pickBarista(
  baristaId: string | null | undefined,
  createdBy: string | null,
  equipo: ReadonlyArray<{ id: string }>,
): string | null {
  const onTeam = (id: string | null | undefined): id is string => !!id && equipo.some((b) => b.id === id);
  if (baristaId) return onTeam(baristaId) ? baristaId : null;
  return onTeam(createdBy) ? createdBy : null;
}

// ── data ──────────────────────────────────────────────────────────────────────

type ProfileRow = { id: string; full_name: string | null; role: PersonRole | null; organization_id: string | null };

/**
 * The person's profile plus their role *in this org*. A person can belong to
 * several orgs (`organization_members`); `profiles.organization_id` is only
 * the active pointer, so membership decides. Null when they don't belong.
 */
export async function resolvePersonInOrg(
  admin: SupabaseClient,
  userId: string,
  organizationId: string,
): Promise<OrgPerson | null> {
  if (!parseCreadoPor(userId)) return null;
  const [{ data: profile }, { data: membership }] = await Promise.all([
    admin.from("profiles").select("id, full_name, role, organization_id").eq("id", userId).maybeSingle<ProfileRow>(),
    admin
      .from("organization_members")
      .select("role")
      .eq("user_id", userId)
      .eq("organization_id", organizationId)
      .maybeSingle<{ role: PersonRole }>(),
  ]);
  if (!profile) return null;
  if (!membership && profile.organization_id !== organizationId) return null;
  return {
    profileId: profile.id,
    fullName: profile.full_name ?? "",
    role: membership?.role ?? profile.role ?? "staff",
  };
}

/** The sede a device belongs to: its own, else the org's first by name (as the tablet always did). */
export async function resolveSedeId(
  admin: SupabaseClient,
  organizationId: string,
  restaurantId: string | null,
): Promise<string | null> {
  if (restaurantId) return restaurantId;
  const { data } = await admin
    .from("restaurants")
    .select("id")
    .eq("organization_id", organizationId)
    .order("name")
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/** Active roster of the sede plus the org's admins (the owner opens the shop too). */
export async function listRosterForSede(
  admin: SupabaseClient,
  organizationId: string,
  restaurantId: string | null,
): Promise<TurnoPerson[]> {
  const sedeId = await resolveSedeId(admin, organizationId, restaurantId);
  const [{ data: members }, { data: admins }] = await Promise.all([
    sedeId
      ? admin.from("restaurant_members").select("active, profile:profiles!inner(id, full_name, role)").eq("restaurant_id", sedeId)
      : Promise.resolve({ data: [] as unknown[] }),
    // Admins by membership (an owner's active org may be another one), like the POS's getEquipo.
    admin.from("organization_members").select("user_id, profiles(full_name)").eq("organization_id", organizationId).eq("role", "admin"),
  ]);
  const byId = new Map<string, TurnoPerson>();
  for (const m of members ?? []) {
    const r = m as { active: boolean; profile: { id: string; full_name: string | null; role: string | null } | null };
    if (!r.profile || r.active === false) continue;
    const name = r.profile.full_name ?? "—";
    byId.set(r.profile.id, { id: r.profile.id, name, initials: initialsOf(name), role: r.profile.role === "admin" ? "admin" : "staff" });
  }
  for (const a of admins ?? []) {
    const id = a.user_id as string;
    if (byId.has(id)) continue;
    const p = a.profiles as { full_name: string | null } | { full_name: string | null }[] | null;
    const name = (Array.isArray(p) ? p[0]?.full_name : p?.full_name) ?? "—";
    byId.set(id, { id, name, initials: initialsOf(name), role: "admin" });
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
}
