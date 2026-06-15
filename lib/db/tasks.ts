import { createSupabaseServerClient } from "@/lib/supabase/server";
import { todayInTz } from "@/lib/utils";
import type { Task } from "@/lib/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTask(r: any): Task {
  return {
    id: r.id,
    restaurant_id: r.restaurant_id,
    title: r.title,
    details: r.details ?? null,
    assigned_to: r.assigned_to ?? null,
    assignee_name: r.assignee?.full_name ?? null,
    created_by: r.created_by,
    scheduled_date: r.scheduled_date ?? null,
    due_time: r.due_time ?? null,
    requires_photo: !!r.requires_photo,
    status: r.status,
    completed_by: r.completed_by ?? null,
    completed_at: r.completed_at ?? null,
    photo_url: r.photo_url ?? null,
    created_at: r.created_at,
  };
}

/** Order helper: pending first, then by scheduled_date (nulls last), then due_time. */
function sortTasks(a: Task, b: Task): number {
  const ad = a.scheduled_date ?? "9999-99-99";
  const bd = b.scheduled_date ?? "9999-99-99";
  if (ad !== bd) return ad.localeCompare(bd);
  return (a.due_time ?? "99:99").localeCompare(b.due_time ?? "99:99");
}

/** Admin view: every non-cancelled task for the sede, with the assignee name. */
export async function listTasks(restaurantId: string): Promise<Task[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("tasks")
    .select("*, assignee:profiles!tasks_assigned_to_fkey(full_name)")
    .eq("restaurant_id", restaurantId)
    .neq("status", "cancelled");
  return (data ?? []).map(mapTask).sort(sortTasks);
}

/** Staff view (/today): the current user's pending tasks — assigned to them or
 *  unassigned — within their visible restaurants (RLS already constrains this). */
export async function listMyTasks(): Promise<Task[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("tasks")
    .select("*, assignee:profiles!tasks_assigned_to_fkey(full_name)")
    .eq("status", "pending")
    .or(`assigned_to.eq.${user.id},assigned_to.is.null`);
  return (data ?? []).map(mapTask).sort(sortTasks);
}

/** Staff view (/today): tasks this user completed today — assigned to them or
 *  unassigned — for the "Completadas hoy" subsection. Bounded to the most
 *  recent completions, then narrowed to today in the sede's timezone. */
export async function listMyCompletedToday(
  timezone = "America/Bogota",
): Promise<Task[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("tasks")
    .select("*, assignee:profiles!tasks_assigned_to_fkey(full_name)")
    .eq("status", "done")
    .or(`completed_by.eq.${user.id},assigned_to.eq.${user.id}`)
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(50);

  const today = todayInTz(timezone);
  return (data ?? [])
    .map(mapTask)
    .filter(
      (t) =>
        t.completed_at &&
        todayInTz(timezone, new Date(t.completed_at)) === today,
    );
}
