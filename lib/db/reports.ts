import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Per-shift completion percentage for the dashboard. */
export interface ShiftSummary {
  shift_id: string;
  restaurant_id: string;
  restaurant_name: string;
  template_id: string;
  template_name: string;
  date: string;
  status: "open" | "closed";
  total_tasks: number;
  completed_tasks: number;
  pct: number;
  novedad_count: number;
  closed_at: string | null;
  /** Admin review (0032). */
  reviewed_at: string | null;
  reviewed_by_name: string | null;
}

export async function getDashboardSummary(date: string): Promise<ShiftSummary[]> {
  const supabase = await createSupabaseServerClient();

  // Pull today's shifts with template + task counts in one go.
  const { data: shifts } = await supabase
    .from("shift_instances")
    .select(
      `id, restaurant_id, status, date, closed_at, reviewed_at,
       reviewer:profiles!shift_instances_reviewed_by_fkey(full_name),
       restaurants:restaurants!inner(name),
       templates:checklist_templates!inner(id, name),
       completions:task_completions(count),
       template_tasks_count:checklist_templates!inner(template_tasks(count))`,
    )
    .eq("date", date);

  if (!shifts) return [];

  // Count novedades in a second query (joining was getting hairy).
  const shiftIds = shifts.map((s) => s.id);
  const { data: novedades } = await supabase
    .from("novedades")
    .select("shift_instance_id")
    .in("shift_instance_id", shiftIds);

  const novedadCount = (novedades ?? []).reduce<Record<string, number>>(
    (acc, n) => {
      acc[n.shift_instance_id] = (acc[n.shift_instance_id] ?? 0) + 1;
      return acc;
    },
    {},
  );

  return shifts.map((s) => {
    // The Supabase typing for nested counts is loose — coerce once.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const total = ((s as any).template_tasks_count?.template_tasks?.[0]?.count ?? 0) as number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const done = ((s as any).completions?.[0]?.count ?? 0) as number;
    return {
      shift_id: s.id,
      restaurant_id: s.restaurant_id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      restaurant_name: (s as any).restaurants?.name ?? "—",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      template_id: (s as any).templates?.id ?? "",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      template_name: (s as any).templates?.name ?? "—",
      date: s.date,
      status: s.status,
      total_tasks: total,
      completed_tasks: done,
      pct: total > 0 ? Math.round((done / total) * 100) : 0,
      novedad_count: novedadCount[s.id] ?? 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      closed_at: ((s as any).closed_at as string | null) ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reviewed_at: ((s as any).reviewed_at as string | null) ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reviewed_by_name: ((s as any).reviewer?.full_name as string | null) ?? null,
    };
  });
}
