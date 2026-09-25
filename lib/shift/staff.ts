import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Context for the tools a person opens from their own shift screen
 * (/shift/[id]/caja, /shift/[id]/inventario): the arqueo and the quick
 * inventory of the sede that turno belongs to.
 *
 * Access is proven with the person's RLS session (they can only see
 * instances of sedes they are a member of, or of their org as admin); the
 * writes then run on the service-role client, exactly like the shared
 * tablet, so both surfaces share one code path and one set of DB helpers.
 */
export interface ShiftToolContext {
  admin: SupabaseClient;
  organizationId: string;
  restaurantId: string;
  sede: { id: string; name: string; tz: string };
  actor: { profileId: string; fullName: string; role: "admin" | "staff" };
  instance: {
    id: string;
    date: string;
    status: "open" | "closed";
    opened_at: string | null;
    closed_at: string | null;
    template_name: string;
    inicio: string;
    fin: string;
  };
}

export async function loadShiftToolContext(shiftId: string): Promise<ShiftToolContext | null> {
  const { profile, supabase } = await requireUser();
  const { data } = await supabase
    .from("shift_instances")
    .select("id, date, status, opened_at, closed_at, restaurant:restaurants!inner(id, name, timezone, organization_id), template:checklist_templates!inner(name, inicio, fin)")
    .eq("id", shiftId)
    .maybeSingle();
  if (!data) return null;
  const r = data as unknown as {
    id: string;
    date: string;
    status: "open" | "closed";
    opened_at: string | null;
    closed_at: string | null;
    restaurant: { id: string; name: string; timezone: string | null; organization_id: string };
    template: { name: string; inicio: string; fin: string };
  };
  if (r.restaurant.organization_id !== profile.organization_id) return null;
  return {
    admin: createSupabaseAdminClient(),
    organizationId: r.restaurant.organization_id,
    restaurantId: r.restaurant.id,
    sede: { id: r.restaurant.id, name: r.restaurant.name, tz: r.restaurant.timezone ?? "America/Bogota" },
    actor: { profileId: profile.id, fullName: profile.full_name ?? "", role: profile.role === "admin" ? "admin" : "staff" },
    instance: {
      id: r.id,
      date: r.date,
      status: r.status,
      opened_at: r.opened_at,
      closed_at: r.closed_at,
      template_name: r.template.name,
      inicio: r.template.inicio,
      fin: r.template.fin,
    },
  };
}

export async function requireShiftToolContext(shiftId: string): Promise<ShiftToolContext> {
  const ctx = await loadShiftToolContext(shiftId);
  if (!ctx) throw new Error("unauthorized");
  return ctx;
}
