import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listShifts } from "@/lib/db/shifts";
import { todayInTz } from "@/lib/utils";

/**
 * Weekly compliance aggregation for the Turnos · Reportes view.
 *
 * Compliance for a shift instance = completed tasks / tasks defined on its
 * template. We aggregate `task_completions` against the *current* template
 * task list (a reasonable approximation — historical task edits aren't
 * versioned per instance), grouped by weekday for the current week in the
 * sede's timezone.
 */

export type ShiftCompliance = {
  template_id: string;
  name: string;
  inicio: string;
  fin: string;
  /** 7 entries, Monday→Sunday. `null` = no shift instance that day. */
  vals: (number | null)[];
  /** Average of the non-null daily values, or `null` when none. */
  avg: number | null;
};

export type WeeklyCompliance = {
  /** The 7 dates (YYYY-MM-DD), Monday→Sunday, this report covers. */
  weekDates: string[];
  /** Global compliance % per weekday (Mon→Sun); `null` = no shifts that day. */
  daily: (number | null)[];
  /** Overall week compliance %, or `null` when there's nothing to measure. */
  globalPct: number | null;
  perShift: ShiftCompliance[];
  kpis: {
    tasksDone: number;
    tasksTotal: number;
    photosDone: number;
    photosTotal: number;
    novedades: number;
    /** Tasks past their shift date with no completion (missed/overdue). */
    late: number;
  };
  hasData: boolean;
};

/** The 7 dates (Mon→Sun) of the week containing `today` (a YYYY-MM-DD string). */
export function weekDatesFor(today: string): string[] {
  // Anchor at UTC noon so day arithmetic never crosses a DST boundary.
  const base = new Date(`${today}T12:00:00Z`);
  const dow = base.getUTCDay(); // 0=Sun … 6=Sat
  const mondayDelta = (dow + 6) % 7; // days back to Monday
  const monday = new Date(base);
  monday.setUTCDate(base.getUTCDate() - mondayDelta);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

function pct(done: number, total: number): number | null {
  return total > 0 ? Math.round((done / total) * 100) : null;
}

export async function getWeeklyCompliance(
  restaurantId: string,
  tz: string,
  /** Any YYYY-MM-DD inside the target week; defaults to the current week. */
  weekOf?: string,
): Promise<WeeklyCompliance> {
  const supabase = await createSupabaseServerClient();
  const today = todayInTz(tz);
  const anchor = weekOf && /^\d{4}-\d{2}-\d{2}$/.test(weekOf) ? weekOf : today;
  const weekDates = weekDatesFor(anchor);
  const weekStart = weekDates[0];
  const weekEnd = weekDates[6];

  // Current shift definitions → per-template task totals + photo requirements.
  const shifts = await listShifts(restaurantId);
  const tmpl = new Map<
    string,
    { name: string; inicio: string; fin: string; total: number; photoTotal: number }
  >();
  for (const s of shifts) {
    tmpl.set(s.id, {
      name: s.name,
      inicio: s.inicio,
      fin: s.fin,
      total: s.tasks.length,
      photoTotal: s.tasks.filter((t) => t.requires_photo).length,
    });
  }

  // Shift instances within the week.
  const { data: instRows } = await supabase
    .from("shift_instances")
    .select("id, template_id, date")
    .eq("restaurant_id", restaurantId)
    .gte("date", weekStart)
    .lte("date", weekEnd);
  const instances = (instRows ?? []) as {
    id: string;
    template_id: string;
    date: string;
  }[];
  const instanceIds = instances.map((i) => i.id);

  // Completions for those instances (one row per completed task).
  const doneByInstance = new Map<string, { done: number; photos: number }>();
  if (instanceIds.length > 0) {
    const { data: compRows } = await supabase
      .from("task_completions")
      .select("shift_instance_id, photo_url")
      .in("shift_instance_id", instanceIds);
    for (const c of compRows ?? []) {
      const row = c as { shift_instance_id: string; photo_url: string | null };
      const agg = doneByInstance.get(row.shift_instance_id) ?? {
        done: 0,
        photos: 0,
      };
      agg.done += 1;
      if (row.photo_url) agg.photos += 1;
      doneByInstance.set(row.shift_instance_id, agg);
    }
  }

  // Novedades tied to this week's shifts.
  let novedades = 0;
  if (instanceIds.length > 0) {
    const { count } = await supabase
      .from("novedades")
      .select("id", { count: "exact", head: true })
      .in("shift_instance_id", instanceIds);
    novedades = count ?? 0;
  }

  // ── Aggregate ────────────────────────────────────────────────────────────
  const dailyDone = Array<number>(7).fill(0);
  const dailyTotal = Array<number>(7).fill(0);
  const dayHasShift = Array<boolean>(7).fill(false);
  // Per (template, weekday) instance compliance for the per-shift table.
  const cellDone = new Map<string, number>();
  const cellTotal = new Map<string, number>();

  let tasksDone = 0;
  let tasksTotal = 0;
  let photosDone = 0;
  let photosTotal = 0;
  let late = 0;

  for (const inst of instances) {
    const t = tmpl.get(inst.template_id);
    if (!t || t.total === 0) continue; // unknown/empty template → not measurable
    const dayIdx = weekDates.indexOf(inst.date);
    if (dayIdx < 0) continue;

    const agg = doneByInstance.get(inst.id) ?? { done: 0, photos: 0 };
    const done = Math.min(agg.done, t.total); // guard against stale extra rows

    tasksDone += done;
    tasksTotal += t.total;
    photosDone += Math.min(agg.photos, t.photoTotal);
    photosTotal += t.photoTotal;
    if (inst.date < today) late += t.total - done;

    dailyDone[dayIdx] += done;
    dailyTotal[dayIdx] += t.total;
    dayHasShift[dayIdx] = true;

    const key = `${inst.template_id}|${dayIdx}`;
    cellDone.set(key, (cellDone.get(key) ?? 0) + done);
    cellTotal.set(key, (cellTotal.get(key) ?? 0) + t.total);
  }

  const daily = weekDates.map((_, i) =>
    dayHasShift[i] ? pct(dailyDone[i], dailyTotal[i]) : null,
  );

  const perShift: ShiftCompliance[] = shifts.map((s) => {
    const vals = Array.from({ length: 7 }, (_, day) => {
      const key = `${s.id}|${day}`;
      if (!cellTotal.has(key)) return null;
      return pct(cellDone.get(key) ?? 0, cellTotal.get(key) ?? 0);
    });
    const present = vals.filter((v): v is number => v !== null);
    const avg =
      present.length > 0
        ? Math.round(present.reduce((a, b) => a + b, 0) / present.length)
        : null;
    return {
      template_id: s.id,
      name: s.name,
      inicio: s.inicio,
      fin: s.fin,
      vals,
      avg,
    };
  });

  return {
    weekDates,
    daily,
    globalPct: pct(tasksDone, tasksTotal),
    perShift,
    kpis: { tasksDone, tasksTotal, photosDone, photosTotal, novedades, late },
    hasData: tasksTotal > 0,
  };
}
