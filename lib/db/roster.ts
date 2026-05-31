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
  const { data } = await supabase
    .from("restaurant_members")
    .select(
      "user_id, phone, active, profile:profiles!inner(id, full_name, role)",
    )
    .eq("restaurant_id", restaurantId);

  if (!data) return [];

  // We don't have an emails table — Supabase stores them on auth.users which
  // is not directly queryable from the anon role. The Equipo UI falls back
  // to an empty email when missing (the row is still editable inline).
  return data
    .map((row) => {
      const r = row as unknown as {
        user_id: string;
        phone: string | null;
        active: boolean;
        profile: {
          id: string;
          full_name: string;
          role: "admin" | "staff" | null;
        } | null;
      };
      if (!r.profile) return null;
      const name = r.profile.full_name ?? "—";
      return {
        id: r.profile.id,
        initials: makeInitials(name),
        name,
        email: "",
        phone: r.phone,
        active: r.active ?? true,
        role: r.profile.role ?? "staff",
      } satisfies RosterMember;
    })
    .filter((m): m is RosterMember => m !== null)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}
