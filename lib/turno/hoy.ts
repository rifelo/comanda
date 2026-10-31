/**
 * The team app's screens (Hoy · Tareas · Abrir · Cerrar) as pure functions —
 * no I/O, no Date: every clock is an "HH:MM" string in the sede's timezone
 * (same contract as ./blocks.ts). Unit-tested in hoy.test.ts.
 *
 * Templates have no «zone» column, so the opening and closing blocks are cut
 * from the tasks' due times: opening = everything due up to «Abrir al
 * público» (or the first 30 min of the turno), closing = the last hour before
 * the turno ends and anything after it.
 */
import type { AdHocTask, TemplateTask } from "@/lib/types";
import { bucketTasks, formatDuration, shiftMinute, toMinutes } from "./blocks";

type TaskLike = Pick<TemplateTask, "id" | "title" | "due_time" | "order_index">;

/** "06:05" | "06:05:00" → "6:05" (how the reference writes times). Bad input → "". */
export function hhmm(t: string | null | undefined): string {
  const m = toMinutes(t);
  if (!Number.isFinite(m)) return "";
  const h = Math.floor(m / 60) % 24;
  return `${h}:${String(m % 60).padStart(2, "0")}`;
}

/** Minutes of `t` on the turno's own line (a turno past midnight unwraps). */
function onLine(t: string | null | undefined, inicio: string, fin: string): number {
  const v = toMinutes(t);
  if (!Number.isFinite(v)) return NaN;
  const i = toMinutes(inicio);
  const f = toMinutes(fin);
  const wraps = Number.isFinite(i) && Number.isFinite(f) && f < i;
  return wraps && v < i ? v + 1440 : v;
}

/** Fin on the turno's line (≥ inicio). */
function finOnLine(inicio: string, fin: string): number {
  const i = toMinutes(inicio);
  const f = toMinutes(fin);
  return Number.isFinite(i) && Number.isFinite(f) && f < i ? f + 1440 : f;
}

// ── Which turno the screen is about ───────────────────────────────────────

export interface TurnoPick {
  instance: { id: string; status: string; opened_by?: string | null };
  template: { id: string; inicio: string; fin: string };
}

/**
 * The turno Hoy shows: `preferId` when it is today's; else an open turno
 * running now (the one assigned to the person first, then one already
 * opened, then the earliest — it closes first); else an open turno past its
 * end (it still owes the close); else the next to start; else the last one.
 */
export function turnoActual<T extends TurnoPick>(
  turnos: readonly T[],
  now: string,
  opts: { preferId?: string | null; asignado?: (t: T) => boolean } = {},
): T | null {
  if (!turnos.length) return null;
  if (opts.preferId) {
    const hit = turnos.find((t) => t.instance.id === opts.preferId);
    if (hit) return hit;
  }
  const open = turnos.filter((t) => t.instance.status !== "closed");
  const n = (t: T) => shiftMinute(now, t.template.inicio, t.template.fin);
  const i = (t: T) => toMinutes(t.template.inicio);
  const f = (t: T) => finOnLine(t.template.inicio, t.template.fin);
  const running = open
    .filter((t) => n(t) >= i(t) && n(t) <= f(t))
    .sort((a, b) => {
      const sa = (opts.asignado?.(a) ? 4 : 0) + (a.instance.opened_by ? 2 : 0);
      const sb = (opts.asignado?.(b) ? 4 : 0) + (b.instance.opened_by ? 2 : 0);
      return sb - sa || i(a) - i(b);
    });
  if (running.length) return running[0];
  const overdue = open.filter((t) => n(t) > f(t)).sort((a, b) => f(a) - f(b));
  if (overdue.length) return overdue[0];
  const next = open.filter((t) => n(t) < i(t)).sort((a, b) => i(a) - i(b));
  if (next.length) return next[0];
  return turnos[turnos.length - 1];
}

/** «Faltan 19 min» / «Faltan 1 h 5 min» / «Hace 10 min» until `target` ("HH:MM"). */
export function faltanLabel(now: string, target: string): string {
  const a = toMinutes(now);
  let b = toMinutes(target);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "";
  // A target far behind is tomorrow's (e.g. 01:00 seen at 23:30).
  if (b - a < -12 * 60) b += 1440;
  const d = b - a;
  if (d === 0) return "Es la hora";
  return d > 0 ? `Faltan ${formatDuration(d)}` : `Hace ${formatDuration(-d)}`;
}

// ── Task list (Hoy «Ahora» + Tareas) ─────────────────────────────────────

export type ItemTarea =
  | { kind: "tarea"; id: string; task: TemplateTask; estado: "atrasada" | "pendiente" | "hecha"; tarde: number }
  | { kind: "inmediata"; id: string; task: AdHocTask; estado: "atrasada" | "pendiente" | "hecha"; tarde: number };

/** Minutes past `due` at `now` on the turno's line (0 when not late or no time). */
export function minutosTarde(due: string | null | undefined, now: string, inicio: string, fin: string): number {
  const d = onLine(due, inicio, fin);
  const n = shiftMinute(now, inicio, fin);
  if (!Number.isFinite(d) || !Number.isFinite(n)) return 0;
  return Math.max(0, n - d);
}

/**
 * Pending first — inmediatas (the owner raised them: they jump the line),
 * then late tasks oldest first, then due now / later / without a time — and
 * the done ones apart, newest order last.
 */
export function listaTareas(args: {
  tasks: readonly TemplateTask[];
  done: (t: TemplateTask) => boolean;
  adHoc?: readonly AdHocTask[];
  now: string;
  inicio: string;
  fin: string;
}): { pendientes: ItemTarea[]; hechas: ItemTarea[]; atrasadas: number } {
  const { tasks, done, adHoc = [], now, inicio, fin } = args;
  const b = bucketTasks({ tasks, done, now, inicio, fin });
  const tarde = (due: string | null) => minutosTarde(due, now, inicio, fin);
  const t = (task: TemplateTask, estado: "atrasada" | "pendiente" | "hecha"): ItemTarea => ({ kind: "tarea", id: task.id, task, estado, tarde: estado === "atrasada" ? tarde(task.due_time) : 0 });
  const live = adHoc.filter((a) => a.status !== "cancelled");
  const inmPend = live
    .filter((a) => a.status === "pending")
    .sort((x, y) => (toMinutes(x.due_time) || -1) - (toMinutes(y.due_time) || -1) || x.created_at.localeCompare(y.created_at))
    .map<ItemTarea>((a) => {
      const late = a.due_time ? tarde(a.due_time) : 0;
      return { kind: "inmediata", id: a.id, task: a, estado: late > 0 ? "atrasada" : "pendiente", tarde: late };
    });
  const inmHechas = live.filter((a) => a.status === "done").map<ItemTarea>((a) => ({ kind: "inmediata", id: a.id, task: a, estado: "hecha", tarde: 0 }));
  const pendientes = [
    ...inmPend,
    ...b.atrasadas.map((x) => t(x, "atrasada")),
    ...b.ahora.map((x) => t(x, "pendiente")),
    ...b.luego.map((x) => t(x, "pendiente")),
    ...b.sin_hora.map((x) => t(x, "pendiente")),
  ];
  const hechas = [...inmHechas, ...b.hechas.map((x) => t(x, "hecha"))];
  return { pendientes, hechas, atrasadas: b.atrasadas.length + inmPend.filter((x) => x.estado === "atrasada").length };
}

/**
 * Hoy's «Ahora» card: the most urgent pending item (late or inmediata) as the
 * highlighted one, then the next few in line.
 */
export function ahora(pendientes: readonly ItemTarea[], max = 3): { destacada: ItemTarea | null; siguientes: ItemTarea[] } {
  const first = pendientes[0] ?? null;
  const destacada = first && (first.estado === "atrasada" || first.kind === "inmediata") ? first : null;
  const rest = destacada ? pendientes.slice(1) : pendientes;
  return { destacada, siguientes: rest.slice(0, destacada ? max - 1 : max) };
}

// ── Abrir el turno ───────────────────────────────────────────────────────

const ABRIR_RE = /abrir\s+al\s+p[uú]blico/i;

/** The «Abrir al público» task of the template, if it has one. */
export function tareaApertura<T extends TaskLike>(tasks: readonly T[]): T | null {
  return tasks.find((t) => ABRIR_RE.test(t.title)) ?? null;
}

/** When the doors open: the «Abrir al público» task's time, else inicio + 30 min. */
export function horaApertura(tasks: readonly TaskLike[], inicio: string): string {
  const t = tareaApertura(tasks);
  if (t?.due_time) return hhmm(t.due_time);
  const i = toMinutes(inicio);
  return Number.isFinite(i) ? hhmm(`${Math.floor(((i + 30) % 1440) / 60)}:${(i + 30) % 60}`) : "";
}

/** By time on the turno's line; untimed tasks last, then template order. */
const byTime = (inicio: string, fin: string) => (a: TaskLike, b: TaskLike) => {
  const x = onLine(a.due_time, inicio, fin);
  const y = onLine(b.due_time, inicio, fin);
  const fx = Number.isFinite(x) ? x : Infinity;
  const fy = Number.isFinite(y) ? y : Infinity;
  return (fx === fy ? 0 : fx < fy ? -1 : 1) || a.order_index - b.order_index;
};

/** Tasks due up to the opening (the «Abrir al público» task itself excluded), by time. */
export function tareasApertura<T extends TaskLike>(tasks: readonly T[], inicio: string, fin: string): T[] {
  const abrir = tareaApertura(tasks);
  const limite = onLine(horaApertura(tasks, inicio), inicio, fin);
  return tasks
    .filter((t) => t !== abrir && Number.isFinite(onLine(t.due_time, inicio, fin)) && onLine(t.due_time, inicio, fin) <= limite)
    .sort(byTime(inicio, fin));
}

export interface Bloque<T> {
  key: string;
  /** «6:30 – 6:38» or «6:30». */
  titulo: string;
  tasks: T[];
}

/**
 * Cuts time-sorted tasks into blocks of at most `max`, never splitting a
 * group that shares a due time unless the group alone is bigger than `max`.
 */
export function bloques<T extends TaskLike>(tasks: readonly T[], max = 6, prefix = "b"): Bloque<T>[] {
  const groups: T[][] = [];
  for (const t of tasks) {
    const last = groups[groups.length - 1];
    if (last && hhmm(last[0].due_time) === hhmm(t.due_time)) last.push(t);
    else groups.push([t]);
  }
  const out: T[][] = [];
  let cur: T[] = [];
  for (const g of groups) {
    if (cur.length && cur.length + g.length > max) {
      out.push(cur);
      cur = [];
    }
    for (const t of g) {
      if (cur.length >= max) {
        out.push(cur);
        cur = [];
      }
      cur.push(t);
    }
  }
  if (cur.length) out.push(cur);
  return out.map((list, i) => {
    const a = hhmm(list[0].due_time);
    const z = hhmm(list[list.length - 1].due_time);
    return { key: `${prefix}${i + 1}`, titulo: a === z ? a : `${a} – ${z}`, tasks: list };
  });
}

// ── Cerrar el turno ──────────────────────────────────────────────────────

/** Tasks due in the last `ventanaMin` before the end, or after it — the closing routine. */
export function tareasCierre<T extends TaskLike>(tasks: readonly T[], inicio: string, fin: string, ventanaMin = 60): T[] {
  const apertura = new Set(tareasApertura(tasks, inicio, fin).map((t) => t.id));
  const abrir = tareaApertura(tasks);
  const desde = finOnLine(inicio, fin) - ventanaMin;
  return tasks
    .filter((t) => t !== abrir && !apertura.has(t.id) && onLine(t.due_time, inicio, fin) >= desde)
    .sort(byTime(inicio, fin));
}

/** Everything that is neither opening nor closing (mid-turno rounds). */
export function tareasDuranteTurno<T extends TaskLike>(tasks: readonly T[], inicio: string, fin: string): T[] {
  const fuera = new Set([...tareasApertura(tasks, inicio, fin), ...tareasCierre(tasks, inicio, fin)].map((t) => t.id));
  const abrir = tareaApertura(tasks);
  return tasks.filter((t) => t !== abrir && !fuera.has(t.id)).sort(byTime(inicio, fin));
}

// ── Flow steps ──────────────────────────────────────────────────────────

export type PasoEstado = "todo" | "now" | "done";
export interface Paso {
  n: number;
  key: string;
  title: string;
  sub: string;
  state: PasoEstado;
}

/** First not-done step is «now» (or `actual` when given and known). */
function marcar(items: Array<Omit<Paso, "state" | "n"> & { done: boolean }>, actual?: string | null): Paso[] {
  const now = items.find((s) => s.key === actual)?.key ?? items.find((s) => !s.done)?.key ?? null;
  return items.map((s, i) => ({ n: i + 1, key: s.key, title: s.title, sub: s.sub, state: s.key === now ? "now" : s.done ? "done" : "todo" }));
}

/** «Abrir el turno»: 1 Validar la base → blocks → Abrir al público. */
export function pasosAbrir(args: {
  baseLista: boolean;
  bloques: ReadonlyArray<{ key: string; titulo: string; total: number; hechas: number }>;
  apertura: string;
  abierto: boolean;
  actual?: string | null;
}): Paso[] {
  return marcar(
    [
      { key: "base", title: "Validar la base", sub: args.baseLista ? "Lista" : "Contar lo que dejaron", done: args.baseLista },
      ...args.bloques.map((b) => ({ key: b.key, title: b.titulo, sub: `${b.hechas} de ${b.total}`, done: b.total > 0 && b.hechas >= b.total })),
      { key: "abrir", title: "Abrir al público", sub: args.apertura, done: args.abierto },
    ],
    args.actual,
  );
}

/** «Cerrar el turno»: tareas → conteo → arqueo → base → entregar. */
export function pasosCerrar(args: {
  tareas: { hechas: number; total: number };
  conteo: { debe: boolean; hecho: boolean; nombre: string };
  arqueo: boolean;
  base: { lista: boolean; monto: string };
  entregado: boolean;
  actual?: string | null;
}): Paso[] {
  const { tareas, conteo, arqueo, base, entregado } = args;
  return marcar(
    [
      { key: "tareas", title: "Tareas de cierre", sub: `${tareas.hechas} de ${tareas.total}`, done: tareas.total === 0 || tareas.hechas >= tareas.total },
      { key: "conteo", title: conteo.debe ? conteo.nombre : "Conteo rápido", sub: !conteo.debe ? "No toca en este turno" : conteo.hecho ? "Enviado" : "Pendiente", done: !conteo.debe || conteo.hecho },
      { key: "arqueo", title: "Arqueo de caja", sub: arqueo ? "Enviado" : "Contar el efectivo", done: arqueo },
      { key: "base", title: "Base para mañana", sub: base.monto, done: base.lista },
      { key: "entregar", title: "Entregar", sub: "Novedades y recibo", done: entregado },
    ],
    args.actual,
  );
}

/** «Siguiente: limpiar» — the label of the step after `key`, or null at the end. */
export function siguientePaso(pasos: readonly Paso[], key: string): Paso | null {
  const i = pasos.findIndex((p) => p.key === key);
  return i >= 0 && i + 1 < pasos.length ? pasos[i + 1] : null;
}

// ── Novedad ─────────────────────────────────────────────────────────────

export const TIPOS_NOVEDAD = ["Se dañó algo", "Faltó algo", "Un cliente", "Otro"] as const;
export type TipoNovedad = (typeof TIPOS_NOVEDAD)[number];

/** The table only has `body`: the chip goes in front («Se dañó algo · …»); «Otro» adds nothing. */
export function cuerpoNovedad(tipo: TipoNovedad | null, texto: string): string {
  const t = texto.replace(/\s+/g, " ").trim();
  if (!tipo || tipo === "Otro") return t;
  return t ? `${tipo} · ${t}` : tipo;
}
