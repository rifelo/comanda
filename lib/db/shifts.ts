import { createSupabaseServerClient } from "@/lib/supabase/server";
import { todayInTz } from "@/lib/utils";
import type {
  AdHocTask,
  Shift,
  ShiftInstance,
  ShiftView,
  TaskCompletion,
  TemplateTask,
} from "@/lib/types";

/** Hydrated row returned by `getTodayShifts`: shift fields the /today list needs
 *  + the joined restaurant/template names so the page doesn't need a second
 *  round trip. */
export interface TodayShiftRow {
  id: string;
  restaurant_id: string;
  status: "open" | "closed";
  restaurant_name: string | null;
  template_name: string | null;
}

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
 *
 * Returns rows already joined with restaurant + template names so callers
 * don't need a second query to render the list.
 */
export async function getTodayShifts(): Promise<TodayShiftRow[]> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // Memberships + restaurant timezones in one round-trip via embed.
  const { data: memberRows } = await supabase
    .from("restaurant_members")
    .select("restaurant_id, restaurant:restaurants!inner(id, timezone)")
    .eq("user_id", user.id);

  if (!memberRows?.length) return [];

  const restaurantIds: string[] = [];
  const dates = new Set<string>();
  for (const m of memberRows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = (m as any).restaurant as { id: string; timezone: string } | null;
    if (!r) continue;
    restaurantIds.push(r.id);
    dates.add(todayInTz(r.timezone));
  }
  if (restaurantIds.length === 0) return [];

  // Single query for the shifts with their joined restaurant/template names.
  const { data: shifts } = await supabase
    .from("shift_instances")
    .select(
      "id, restaurant_id, status, restaurant:restaurants(name), template:checklist_templates(name)",
    )
    .in("restaurant_id", restaurantIds)
    .in("date", Array.from(dates));

  return (shifts ?? []).map((s) => ({
    id: s.id as string,
    restaurant_id: s.restaurant_id as string,
    status: s.status as "open" | "closed",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    restaurant_name: ((s as any).restaurant?.name as string | undefined) ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    template_name: ((s as any).template?.name as string | undefined) ?? null,
  }));
}

/** Hydrate a shift with its template, tasks, completions, and restaurant.
 *
 * Was previously: shift → then parallel(template, restaurant, tasks,
 * completions). We embed template + restaurant on the initial shift query,
 * then fan out template_tasks + task_completions in a single round-trip —
 * cutting the wall time roughly in half on a cold path. */
export async function getShiftView(shiftId: string): Promise<ShiftView | null> {
  const supabase = await createSupabaseServerClient();

  // Embed the opener profile alongside template + restaurant so the admin
  // detail page doesn't need a separate roundtrip for the "abrió por ..."
  // label. Left join (no `!inner`) — a shift that hasn't been opened yet
  // has opened_by = null and should still hydrate.
  const shiftPromise = supabase
    .from("shift_instances")
    .select(
      "*, template:checklist_templates!inner(*), restaurant:restaurants!inner(*), opener:profiles!shift_instances_opened_by_fkey(id, full_name)",
    )
    .eq("id", shiftId)
    .single();

  // Fan out the two list queries in parallel with the shift fetch. Both
  // are keyed by IDs we know up-front (template_id and shift id), but
  // template_id we only know via the shift row — so the tasks query has
  // to be sequential. Completions however are scoped to shiftId already
  // and can race the shift fetch.
  const completionsPromise = supabase
    .from("task_completions")
    .select("*")
    .eq("shift_instance_id", shiftId);

  // Ad-hoc tasks raised during the shift (0015), with the assignee name joined.
  const adHocPromise = supabase
    .from("ad_hoc_tasks")
    .select("*, assignee:profiles!ad_hoc_tasks_assigned_to_fkey(full_name)")
    .eq("shift_instance_id", shiftId)
    .order("created_at");

  const { data: shiftRow, error } = await shiftPromise;
  if (error || !shiftRow) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const template = (shiftRow as any).template;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const restaurant = (shiftRow as any).restaurant;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const opener = ((shiftRow as any).opener ?? null) as ShiftView["opener"];
  if (!template || !restaurant) return null;

  const [{ data: tasks }, { data: completions }, { data: adHocRows }] =
    await Promise.all([
      supabase
        .from("template_tasks")
        .select("*")
        .eq("template_id", template.id)
        .order("order_index"),
      completionsPromise,
      adHocPromise,
    ]);
  if (!tasks) return null;

  const completionsMap: Record<string, TaskCompletion> = {};
  (completions ?? []).forEach((c) => {
    completionsMap[c.template_task_id] = c as TaskCompletion;
  });

  const adHocTasks: AdHocTask[] = (adHocRows ?? []).map((r) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = r as any;
    return {
      id: row.id,
      shift_instance_id: row.shift_instance_id,
      restaurant_id: row.restaurant_id,
      title: row.title,
      instructions: row.instructions ?? null,
      assigned_to: row.assigned_to ?? null,
      assignee_name: row.assignee?.full_name ?? null,
      created_by: row.created_by,
      due_time: row.due_time ?? null,
      status: row.status,
      completed_by: row.completed_by ?? null,
      completed_at: row.completed_at ?? null,
      created_at: row.created_at,
    };
  });

  // Strip the embedded relations off the shift row so the returned
  // `shift` matches `ShiftInstance` shape exactly.
  /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
  const {
    template: _t,
    restaurant: _r,
    opener: _o,
    ...shiftCols
  } = shiftRow as any;
  /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */

  return {
    shift: shiftCols as ShiftInstance,
    template,
    restaurant,
    tasks,
    completions: completionsMap,
    opener,
    adHocTasks,
  };
}

// Shift generation lives in the cron route at app/api/cron/generate-shifts/route.ts —
// it needs the service-role client to bypass RLS across orgs and so doesn't share
// code with this RLS-aware module.

// ─────────────────────────────────────────────────────────────────
// Shift (= checklist_template) CRUD reads for the redesigned Turnos module.
// The table is still `checklist_templates` (see 0009) — the rename would
// have rippled through every FK + policy without changing behavior, so we
// kept the storage name and aliased the type.
// ─────────────────────────────────────────────────────────────────

type ShiftWithTasks = Shift & { tasks: TemplateTask[] };

function normalizeShiftRow(row: Record<string, unknown>): ShiftWithTasks | null {
  if (!row || typeof row !== "object") return null;
  const tasksRaw = Array.isArray(row.template_tasks) ? row.template_tasks : [];
  const tasks = (tasksRaw as TemplateTask[]).slice().sort(
    (a, b) => a.order_index - b.order_index,
  );
  return {
    id: row.id as string,
    restaurant_id: row.restaurant_id as string,
    name: row.name as string,
    active: (row.active as boolean) ?? true,
    version: (row.version as number) ?? 1,
    inicio: ((row.inicio as string) ?? "10:30").slice(0, 5),
    fin: ((row.fin as string) ?? "14:30").slice(0, 5),
    dias: Array.isArray(row.dias)
      ? (row.dias as boolean[])
      : [true, true, true, true, true, true, true],
    tasks,
  };
}

/** List active shifts for a restaurant, each with its ordered task list. */
export async function listShifts(
  restaurantId: string,
): Promise<ShiftWithTasks[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("checklist_templates")
    .select("*, template_tasks(*)")
    .eq("restaurant_id", restaurantId)
    .eq("active", true)
    .order("inicio");
  if (!data) return [];
  return data
    .map((r) => normalizeShiftRow(r as Record<string, unknown>))
    .filter((r): r is ShiftWithTasks => r !== null);
}

/** Get one shift by id including its ordered tasks. Returns null if missing. */
export async function getShift(id: string): Promise<ShiftWithTasks | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("checklist_templates")
    .select("*, template_tasks(*)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  return normalizeShiftRow(data as Record<string, unknown>);
}
