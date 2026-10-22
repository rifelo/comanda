/**
 * Per-task weekdays (template_tasks.dias, mig 0059). Pure; tested in
 * dias-tarea.test.ts. The mask is lun = 0 … dom = 6, like the turno's own
 * `dias`; null / missing = every day the turno runs.
 */

/** Mon-indexed weekday (0 = lunes … 6 = domingo) of a YYYY-MM-DD day. */
export function diaIdx(fecha: string): number {
  const [y, m, d] = fecha.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 ? 6 : dow - 1;
}

/** Normalize a stored mask: anything but 7 booleans with at least one day on = every day (null). */
export function normDias(dias: unknown): boolean[] | null {
  if (!Array.isArray(dias) || dias.length !== 7) return null;
  const m = dias.map(Boolean);
  if (m.every(Boolean) || !m.some(Boolean)) return null;
  return m;
}

/** Does a task with this mask apply on `fecha`? */
export function tareaToca(dias: unknown, fecha: string): boolean {
  const m = normDias(dias);
  return m === null || m[diaIdx(fecha)];
}

/**
 * The tasks of a turno instance on `fecha`. A task completed in that instance
 * stays even if its days changed later, so history never loses a done task.
 */
export function tareasDelDia<T extends { id: string; dias?: unknown }>(
  tasks: ReadonlyArray<T>,
  fecha: string,
  hechas?: { has(id: string): boolean } | Record<string, unknown>,
): T[] {
  const done = (id: string) => (hechas ? ("has" in hechas && typeof hechas.has === "function" ? (hechas as { has(id: string): boolean }).has(id) : Boolean((hechas as Record<string, unknown>)[id])) : false);
  return tasks.filter((t) => tareaToca(t.dias, fecha) || done(t.id));
}

const CORTO = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];

/** «lun · jue» for a partial mask, null for every day. */
export function diasLabel(dias: unknown): string | null {
  const m = normDias(dias);
  if (!m) return null;
  return CORTO.filter((_, i) => m[i]).join(" · ");
}
