/**
 * Time blocks for the tablet checklist — pure, unit-tested.
 *
 * Big-chain ops boards don't show a flat list: they show what is late,
 * what is due now, and what comes later. `bucketTasks` sorts a turno's
 * tasks into those blocks from their `due_time` and the wall clock (both
 * "HH:MM" strings in the sede's timezone, so nothing here touches Date).
 */
import type { AdHocTask, TemplateTask } from "@/lib/types";

export type Block = "atrasadas" | "ahora" | "luego" | "sin_hora" | "hechas";

export interface Buckets<T> {
  atrasadas: T[];
  ahora: T[];
  luego: T[];
  sin_hora: T[];
  hechas: T[];
}

/** "06:30" | "06:30:00" → 390. Invalid input → NaN (callers treat as "no time"). */
export function toMinutes(hhmm: string | null | undefined): number {
  if (!hhmm) return NaN;
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
  return h * 60 + m;
}

/**
 * Minutes since midnight for `now`, unwrapped for turnos that cross
 * midnight: with `inicio 22:00 · fin 06:00`, a clock reading 00:30 is
 * *after* 22:00, so it becomes 1470 (24 h + 30 min). Task due times get
 * the same treatment in `bucketTasks` so comparisons stay linear.
 */
export function shiftMinute(now: string, inicio: string, fin: string): number {
  const n = toMinutes(now);
  const i = toMinutes(inicio);
  const f = toMinutes(fin);
  if (!Number.isFinite(n)) return NaN;
  const wraps = Number.isFinite(i) && Number.isFinite(f) && f < i;
  return wraps && n < i ? n + 1440 : n;
}

function unwrapDue(due: number, inicio: string, fin: string): number {
  const i = toMinutes(inicio);
  const f = toMinutes(fin);
  const wraps = Number.isFinite(i) && Number.isFinite(f) && f < i;
  return wraps && due < i ? due + 1440 : due;
}

/** A pending task whose due time has passed (`graceMin` softens the edge). */
export function isOverdue(task: { due_time: string | null }, nowMin: number, graceMin = 0): boolean {
  const due = toMinutes(task.due_time);
  if (!Number.isFinite(due) || !Number.isFinite(nowMin)) return false;
  return due + graceMin < nowMin;
}

export function bucketTasks<T extends { id: string; due_time: string | null }>(args: {
  tasks: readonly T[];
  done: (t: T) => boolean;
  /** "HH:MM" wall clock in the sede's timezone. */
  now: string;
  inicio: string;
  fin: string;
  /** How far ahead "Ahora" reaches, in minutes (default 30). */
  windowMin?: number;
}): Buckets<T> {
  const { tasks, done, now, inicio, fin, windowMin = 30 } = args;
  const nowMin = shiftMinute(now, inicio, fin);
  const out: Buckets<T> = { atrasadas: [], ahora: [], luego: [], sin_hora: [], hechas: [] };
  for (const t of tasks) {
    if (done(t)) {
      out.hechas.push(t);
      continue;
    }
    const due = toMinutes(t.due_time);
    if (!Number.isFinite(due)) {
      out.sin_hora.push(t);
      continue;
    }
    if (!Number.isFinite(nowMin)) {
      out.luego.push(t);
      continue;
    }
    const d = unwrapDue(due, inicio, fin);
    if (d < nowMin) out.atrasadas.push(t);
    else if (d <= nowMin + windowMin) out.ahora.push(t);
    else out.luego.push(t);
  }
  return out;
}

/**
 * Ad-hoc ("inmediata") tasks the admin raised on the running shift.
 * Pending ones first: no due time (INMEDIATA) before scheduled ones, then by
 * time. Cancelled tasks are dropped.
 */
export function bucketAdHoc(adHoc: readonly AdHocTask[], now: string): { pendientes: AdHocTask[]; hechas: AdHocTask[]; overdue: number } {
  const nowMin = toMinutes(now);
  const live = adHoc.filter((t) => t.status !== "cancelled");
  const pendientes = live
    .filter((t) => t.status === "pending")
    .sort((a, b) => {
      const da = toMinutes(a.due_time);
      const db = toMinutes(b.due_time);
      const ia = Number.isFinite(da) ? da : -1;
      const ib = Number.isFinite(db) ? db : -1;
      return ia - ib || a.created_at.localeCompare(b.created_at);
    });
  const hechas = live.filter((t) => t.status === "done");
  const overdue = pendientes.filter((t) => isOverdue(t, nowMin)).length;
  return { pendientes, hechas, overdue };
}

export interface TurnoSummary {
  done: number;
  total: number;
  photosDone: number;
  photosTotal: number;
  /** Pending template tasks past their due time at `now`. */
  overdue: number;
  novedades: number;
  adHocPending: number;
  pendingTasks: TemplateTask[];
  /** Minutes between opened_at and closed_at; null until both exist. */
  durationMin: number | null;
}

export function summarize(args: {
  tasks: readonly TemplateTask[];
  completions: Record<string, { photo_url: string | null }>;
  adHoc: readonly AdHocTask[];
  novedades: number;
  now: string;
  inicio: string;
  fin: string;
  opened_at: string | null;
  closed_at: string | null;
}): TurnoSummary {
  const { tasks, completions, adHoc, novedades, now, inicio, fin, opened_at, closed_at } = args;
  const isDone = (t: TemplateTask) => !!completions[t.id];
  const b = bucketTasks({ tasks, done: isDone, now, inicio, fin });
  const photoTasks = tasks.filter((t) => t.requires_photo);
  const pendingTasks = tasks.filter((t) => !isDone(t));
  let durationMin: number | null = null;
  if (opened_at && closed_at) {
    const ms = new Date(closed_at).getTime() - new Date(opened_at).getTime();
    durationMin = Number.isFinite(ms) && ms >= 0 ? Math.round(ms / 60_000) : null;
  }
  return {
    done: tasks.length - pendingTasks.length,
    total: tasks.length,
    photosDone: photoTasks.filter((t) => !!completions[t.id]?.photo_url).length,
    photosTotal: photoTasks.length,
    overdue: b.atrasadas.length,
    novedades,
    adHocPending: adHoc.filter((t) => t.status === "pending").length,
    pendingTasks,
    durationMin,
  };
}

/** 95 → "1 h 35 min"; 40 → "40 min". */
export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
