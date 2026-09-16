/**
 * Pure helpers for turnos with puestos (no I/O, unit-tested): group a
 * template's tasks by puesto, compute a puesto's state from the shift's
 * completions (incl. the soft handoff gate), progress, and who is assigned.
 */
import type { TaskCompletion, TemplatePuesto, TemplateTask, WeeklyAssignment, Puesto } from "@/lib/types";

/** Key of the single implicit group on a flat (legacy) template. */
export const ALL_KEY = "__all__";

export type PuestoStatus = "por_iniciar" | "esperando" | "en_curso" | "listo" | "sin_tareas";

export interface PuestoGroup {
  key: string;
  puesto: Puesto | null;
  waitsForTaskId: string | null;
  tasks: TemplateTask[];
}

/**
 * Tasks per puesto, in template_puestos order. A template without puestos
 * yields one `__all__` group holding every task and no shared tasks; with
 * puestos, tasks whose puesto is null (or not configured on the template)
 * are `shared` — shown under "Compartidas" in every puesto's checklist.
 */
export function groupTasksByPuesto(
  tasks: ReadonlyArray<TemplateTask>,
  puestos: ReadonlyArray<TemplatePuesto>,
): { groups: PuestoGroup[]; shared: TemplateTask[] } {
  const ordered = [...tasks].sort((a, b) => a.order_index - b.order_index);
  if (!puestos.length) {
    return { groups: [{ key: ALL_KEY, puesto: null, waitsForTaskId: null, tasks: ordered }], shared: [] };
  }
  const byPuesto = new Map<string, TemplateTask[]>();
  const groups: PuestoGroup[] = [...puestos]
    .sort((a, b) => a.position - b.position)
    .map((tp) => {
      const list: TemplateTask[] = [];
      byPuesto.set(tp.puesto_id, list);
      return { key: tp.puesto_id, puesto: tp.puesto, waitsForTaskId: tp.waits_for_task_id, tasks: list };
    });
  const shared: TemplateTask[] = [];
  for (const t of ordered) {
    const list = t.puesto_id ? byPuesto.get(t.puesto_id) : undefined;
    if (list) list.push(t);
    else shared.push(t);
  }
  return { groups, shared };
}

export interface PuestoGate {
  taskId: string;
  title: string;
  done: boolean;
  completedBy: string | null;
}

/**
 * State of one puesto on a given shift. The gate is soft: it only produces
 * `esperando` while nothing of this puesto is done and the person hasn't
 * chosen to start anyway.
 */
export function puestoState(args: {
  tasks: ReadonlyArray<TemplateTask>;
  completions: Readonly<Record<string, TaskCompletion>>;
  waitsForTaskId: string | null;
  allTasks: ReadonlyArray<TemplateTask>;
  startedAnyway?: boolean;
}): { status: PuestoStatus; done: number; total: number; gate: PuestoGate | null } {
  const total = args.tasks.length;
  const done = args.tasks.filter((t) => Boolean(args.completions[t.id])).length;
  let gate: PuestoGate | null = null;
  if (args.waitsForTaskId) {
    const gt = args.allTasks.find((t) => t.id === args.waitsForTaskId);
    if (gt) {
      const c = args.completions[gt.id];
      gate = { taskId: gt.id, title: gt.title, done: Boolean(c), completedBy: c?.completed_by ?? null };
    }
  }
  let status: PuestoStatus;
  if (total === 0) status = "sin_tareas";
  else if (done === total) status = "listo";
  else if (done > 0) status = "en_curso";
  else if (gate && !gate.done && !args.startedAnyway) status = "esperando";
  else status = "por_iniciar";
  return { status, done, total, gate };
}

/** Whole-turno progress (all tasks, shared included). */
export function turnoProgress(
  tasks: ReadonlyArray<TemplateTask>,
  completions: Readonly<Record<string, TaskCompletion>>,
): { done: number; total: number; pct: number; allDone: boolean } {
  const total = tasks.length;
  const done = tasks.filter((t) => Boolean(completions[t.id])).length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0, allDone: total > 0 && done === total };
}

/** member_id assigned to (turno, weekday, puesto); a null puesto matches only legacy rows. */
export function assignedFor(
  assignments: ReadonlyArray<WeeklyAssignment>,
  templateId: string,
  diaIdx: number,
  puestoId: string | null,
): string | null {
  const row = assignments.find(
    (a) => a.template_id === templateId && a.dia_idx === diaIdx && (a.puesto_id ?? null) === puestoId,
  );
  return row?.member_id ?? null;
}

/** 0 = Monday … 6 = Sunday for a YYYY-MM-DD (UTC math, no tz reinterpretation). */
export function todayIdxOf(yyyyMMdd: string): number {
  const [y, m, d] = yyyyMMdd.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 ? 6 : dow - 1;
}
