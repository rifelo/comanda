import { createSupabaseServerClient } from "@/lib/supabase/server";
import { todayInTz } from "@/lib/utils";
import type { ShiftInstance, ShiftView, TaskCompletion } from "@/lib/types";

/**
 * Today's shifts for the *operational* view (/today).
 *
 * Scoped to `restaurant_members` membership for everyone — including
 * admins. Admins still see every restaurant in their own admin views
 * (dashboard, reports, drilldowns) via RLS, but /today is the "shift I'm
 * working right now" surface: an admin shouldn't see all 3 sedes here
 * unless they've explicitly been added to those restaurants' equipo. An
 * admin with zero memberships gets an empty /today, which is correct —
 * they have /dashboard. Staff are unaffected (their visibility was always
 * membership-bound via RLS anyway).
 */
export async function getTodayShifts() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: memberships } = await supabase
    .from("restaurant_members")
    .select("restaurant_id")
    .eq("user_id", user.id);

  const restaurantIds = (memberships ?? []).map((m) => m.restaurant_id);
  if (restaurantIds.length === 0) return [];

  // Pull timezone per member restaurant so we can compute "today" locally.
  const { data: restaurants } = await supabase
    .from("restaurants")
    .select("id, timezone")
    .in("id", restaurantIds);
  if (!restaurants?.length) return [];

  const dates = restaurants.map((r) => ({
    restaurant_id: r.id,
    date: todayInTz(r.timezone),
  }));

  const { data: shifts } = await supabase
    .from("shift_instances")
    .select("*")
    .in("restaurant_id", restaurantIds)
    .in("date", Array.from(new Set(dates.map((d) => d.date))));

  return (shifts ?? []) as ShiftInstance[];
}

/** Hydrate a shift with its template, tasks, completions, and restaurant. */
export async function getShiftView(shiftId: string): Promise<ShiftView | null> {
  const supabase = await createSupabaseServerClient();

  const { data: shift, error } = await supabase
    .from("shift_instances")
    .select("*")
    .eq("id", shiftId)
    .single();
  if (error || !shift) return null;

  const [{ data: template }, { data: restaurant }, { data: tasks }, { data: completions }] =
    await Promise.all([
      supabase.from("checklist_templates").select("*").eq("id", shift.template_id).single(),
      supabase.from("restaurants").select("*").eq("id", shift.restaurant_id).single(),
      supabase
        .from("template_tasks")
        .select("*")
        .eq("template_id", shift.template_id)
        .order("order_index"),
      supabase.from("task_completions").select("*").eq("shift_instance_id", shiftId),
    ]);

  if (!template || !restaurant || !tasks) return null;

  const completionsMap: Record<string, TaskCompletion> = {};
  (completions ?? []).forEach((c) => {
    completionsMap[c.template_task_id] = c as TaskCompletion;
  });

  return {
    shift: shift as ShiftInstance,
    template,
    restaurant,
    tasks,
    completions: completionsMap,
  };
}

// Shift generation lives in the cron route at app/api/cron/generate-shifts/route.ts —
// it needs the service-role client to bypass RLS across orgs and so doesn't share
// code with this RLS-aware module.
