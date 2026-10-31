import type { SupabaseClient } from "@supabase/supabase-js";
import { getDashboardSummary } from "@/lib/db/reports";
import { listShifts } from "@/lib/db/shifts";
import { isoMonday, listAssignments } from "@/lib/db/assignments";
import { listRoster } from "@/lib/db/roster";
import { getCostosPendientes, totalPendientes } from "@/lib/db/costos-pendientes";
import { countFaltantesAbiertos } from "@/lib/inventario/faltantes-db";
import { loadConteosPanel } from "@/lib/inventario/conteos";
import { listCierresSede } from "@/lib/caja/cierres";
import { diaIdx, tareasDelDia } from "@/lib/turno/dias-tarea";
import { nowInTz } from "@/lib/utils";
import { atrasadas, estadoBase, estadoTurno, type EstadoTurno, type PorAtenderInput } from "./hoy";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;

/** One turno of the day on the owner's Hoy. */
export interface TurnoDia {
  templateId: string;
  shiftId: string | null;
  name: string;
  horario: string;
  estado: EstadoTurno;
  /** Who is on it (weekly assignment), or null. */
  persona: string | null;
  done: number;
  total: number;
  atrasadas: number;
  novedades: number;
  fotosPendientes: number;
  revisadoPor: string | null;
  revisadoAt: string | null;
}

/**
 * The turnos of a sede on `date`: the templates that run that weekday (or
 * already have an instance), overlaid with the live instance — progress,
 * late tasks (today only), novedades, missing photos, review — and the
 * person from that week's assignments. Read-only.
 */
export async function loadTurnosDia(db: Db, sede: { id: string; tz: string }, date: string, esHoy: boolean): Promise<TurnoDia[]> {
  const [summary, shifts, assignments, roster] = await Promise.all([
    getDashboardSummary(date),
    listShifts(sede.id),
    listAssignments(sede.id, isoMonday(date)),
    listRoster(sede.id),
  ]);
  const bySummary = new Map(summary.filter((s) => s.restaurant_id === sede.id).map((s) => [s.template_id, s]));
  const shiftIds = [...bySummary.values()].map((s) => s.shift_id);
  const { data: comps } = shiftIds.length
    ? await db.from("task_completions").select("shift_instance_id, template_task_id, photo_url").in("shift_instance_id", shiftIds)
    : { data: [] as { shift_instance_id: string; template_task_id: string; photo_url: string | null }[] };
  const done = new Set((comps ?? []).map((c) => `${c.shift_instance_id}:${c.template_task_id}`));
  const withPhoto = new Set((comps ?? []).filter((c) => c.photo_url).map((c) => `${c.shift_instance_id}:${c.template_task_id}`));
  const nameOf = new Map(roster.map((r) => [r.id, r.name]));
  const idx = diaIdx(date);
  const now = nowInTz(sede.tz);

  return shifts
    .filter((t) => bySummary.has(t.id) || (Array.isArray(t.dias) ? t.dias[idx] !== false : true))
    .map((t) => {
      const s = bySummary.get(t.id) ?? null;
      const tareas = tareasDelDia(t.tasks, date);
      const cell = assignments.find((a) => a.template_id === t.id && a.dia_idx === idx && !a.puesto_id) ?? assignments.find((a) => a.template_id === t.id && a.dia_idx === idx);
      const doneHere = new Set(s ? tareas.filter((k) => done.has(`${s.shift_id}:${k.id}`)).map((k) => k.id) : []);
      return {
        templateId: t.id,
        shiftId: s?.shift_id ?? null,
        name: t.name,
        horario: `${t.inicio.slice(0, 5)} – ${t.fin.slice(0, 5)}`,
        estado: estadoTurno({ status: s?.status ?? null, reviewedAt: s?.reviewed_at ?? null }),
        persona: cell?.member_id ? nameOf.get(cell.member_id) ?? null : null,
        done: s?.completed_tasks ?? 0,
        total: s?.total_tasks ?? tareas.length,
        atrasadas: esHoy && s?.status === "open" ? atrasadas(tareas, doneHere, now) : 0,
        novedades: s?.novedad_count ?? 0,
        fotosPendientes: s ? tareas.filter((k) => k.requires_photo && !withPhoto.has(`${s.shift_id}:${k.id}`)).length : 0,
        revisadoPor: s?.reviewed_by_name ?? null,
        revisadoAt: s?.reviewed_at ?? null,
      };
    })
    .sort((a, b) => a.horario.localeCompare(b.horario));
}

/**
 * Counts behind «Por atender» (everything except the day's turnos and open
 * orders, which the page already has). Each read is independent and
 * failure-tolerant: one broken table never blanks the owner's home.
 */
export async function loadPorAtender(
  db: Db,
  scope: { orgId: string; sedeId: string; tz: string },
): Promise<Omit<PorAtenderInput, "date" | "turnosPorRevisar" | "pedidosAbiertos" | "pedidosViejos" | "porCobrar">> {
  const safe = async <T,>(p: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await p;
    } catch (e) {
      console.error("[loadPorAtender]", e);
      return fallback;
    }
  };
  const [faltantes, conteos, costos, cierres, arqueos, sugerencias] = await Promise.all([
    safe(countFaltantesAbiertos(db, scope.orgId), { agotado: 0, bajo: 0 }),
    safe(loadConteosPanel(db, scope.orgId, scope.tz), null),
    safe(getCostosPendientes(db, scope.orgId), null),
    safe(listCierresSede(db, scope.sedeId, 1), []),
    safe(
      Promise.resolve(
        db.from("caja_cierres").select("id", { count: "exact", head: true }).eq("organization_id", scope.orgId).eq("status", "pendiente"),
      ).then((r) => r.count ?? 0),
      0,
    ),
    safe(
      Promise.resolve(
        db.from("inventario_sugerencias").select("id", { count: "exact", head: true }).eq("organization_id", scope.orgId).eq("status", "pendiente"),
      ).then((r) => r.count ?? 0),
      0,
    ),
  ]);
  const last = cierres[0] ?? null;
  return {
    arqueosPorAprobar: arqueos,
    base: { estado: estadoBase(last), turno: last?.shift_name ?? null },
    agotado: faltantes.agotado,
    bajo: faltantes.bajo,
    conteosPorAprobar: conteos?.pendientes.length ?? 0,
    costosPorRevisar: costos ? totalPendientes(costos) : 0,
    sugerencias,
  };
}
