import { createSupabaseServerClient } from "@/lib/supabase/server";
import { todayInTz } from "@/lib/utils";
import type { ShiftInstance, ShiftView, TaskCompletion } from "@/lib/types";

/**
 * Fetch (or auto-create) today's open shifts for the calling staff member.
 * Staff usually have one restaurant; we return all visible shifts for today.
 */
export async function getTodayShifts() {
  const supabase = await createSupabaseServerClient();

  // We need restaurants the user can see — RLS handles isolation, so plain select works.
  const { data: restaurants } = await supabase
    .from("restaurants")
    .select("id, timezone");

  if (!restaurants?.length) return [];

  const dates = restaurants.map((r) => ({
    restaurant_id: r.id,
    date: todayInTz(r.timezone),
  }));

  const { data: shifts } = await supabase
    .from("shift_instances")
    .select("*")
    .in(
      "restaurant_id",
      dates.map((d) => d.restaurant_id),
    )
    .in(
      "date",
      Array.from(new Set(dates.map((d) => d.date))),
    );

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
