import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { RosterMember } from "@/lib/types";

/**
 * Derive 2-letter initials from a full name. Mirrors the design's
 * `makeRosterId` from `comanda-turnos.jsx:56-62`:
 *   "Mariana Castaño" → "MC"
 *   "Sara"            → "SA"
 *   ""                → "XX"
 *
 * Uniqueness across the roster isn't enforced (callers display them as a
 * visual cue, not an id) — the canonical id is `profiles.id` (a UUID).
 */
export function makeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "";
  const b = parts[1]?.[0] ?? parts[0]?.[1] ?? "";
  const base = (a + b).toUpperCase();
  return base.length === 2 ? base : "XX";
}

/**
 * List the roster (team members) for a restaurant. Joins
 * `restaurant_members` → `profiles` and projects the columns the Equipo +
 * Asignación UIs need.
 */
export async function listRoster(restaurantId: string): Promise<RosterMember[]> {
  const supabase = await createSupabaseServerClient();

  // The sede's explicit members (carry per-sede phone + active state).
  const { data: memberData } = await supabase
    .from("restaurant_members")
    .select(
      "user_id, phone, active, profile:profiles!inner(id, full_name, role)",
    )
    .eq("restaurant_id", restaurantId);

  // The org's owner(s): admins live on `profiles`, not necessarily on
  // `restaurant_members`, so we include them explicitly. RLS ("profiles read
  // own org") lets an admin read them.
  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("organization_id")
    .eq("id", restaurantId)
    .single();
  const orgId = (restaurant as { organization_id: string } | null)
    ?.organization_id;
  const { data: ownerData } = orgId
    ? await supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("organization_id", orgId)
        .eq("role", "admin")
    : { data: null };

  // We don't have an emails table — Supabase stores them on auth.users which
  // is not directly queryable from the anon role. The Equipo UI falls back
  // to an empty email when missing (the row is still editable inline).
  const byId = new Map<string, RosterMember>();

  for (const row of memberData ?? []) {
    const r = row as unknown as {
      phone: string | null;
      active: boolean;
      profile: {
        id: string;
        full_name: string;
        role: "admin" | "staff" | null;
      } | null;
    };
    if (!r.profile) continue;
    const name = r.profile.full_name ?? "—";
    byId.set(r.profile.id, {
      id: r.profile.id,
      initials: makeInitials(name),
      name,
      email: "",
      phone: r.phone,
      active: r.active ?? true,
      role: r.profile.role ?? "staff",
      isMember: true,
    });
  }

  // Add any owner not already present as a member (membership-less row).
  for (const row of ownerData ?? []) {
    const o = row as { id: string; full_name: string | null };
    if (byId.has(o.id)) continue;
    const name = o.full_name ?? "—";
    byId.set(o.id, {
      id: o.id,
      initials: makeInitials(name),
      name,
      email: "",
      phone: null,
      active: true,
      role: "admin",
      isMember: false,
    });
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
}
