import "server-only";
import { esperadoCaja, localToUtc, ventanaTurno } from "@/lib/caja/arqueo";
import { sumPagosVentana } from "@/lib/caja/cierres";
import { loadCajaEstado, type CajaEstado } from "@/lib/caja/estado";
import { loadAcabando } from "@/lib/inventario/acabando-db";
import { buildInsumos, marcado } from "@/lib/inventario/acabando";
import { tareasDelDia } from "@/lib/turno/dias-tarea";
import { nowInTz, todayInTz } from "@/lib/utils";
import type { AdHocTask, TemplateTask } from "@/lib/types";
import { listaTareas, turnoActual } from "./hoy";
import type { TurnoContext } from "./server";

/**
 * Extra reads for the team app (P1). lib/turno/server.ts stays the gate +
 * board loader (F2/P3 own it); everything new the screens need lives here.
 */

/** «Debería haber en caja» exactly as /turno/caja computes it (server rows only, no offline queue). */
export function esperadoDe(estado: CajaEstado): number {
  const t0 = estado.ventana?.desde ? Date.parse(estado.ventana.desde) : 0;
  let ingresos = 0;
  let salidas = 0;
  for (const m of estado.movimientos) {
    if (m.anuladoAt || Date.parse(m.createdAt) < t0) continue;
    if (m.tipo === "ingreso") ingresos += m.monto;
    else salidas += m.monto;
  }
  return esperadoCaja(estado.baseInicial, estado.pagos.efectivo, ingresos, salidas);
}

/**
 * The caja state re-centred on one turno. loadCajaEstado picks «the open
 * turno that started last» (lib/caja is read-only for P1), which on a day
 * with overlapping turnos — or task-only turnos like «Regar las plantas» —
 * is not the one being closed. The close flow needs *its* drawer: same
 * window, payments and expected end as loadCajaEstado computes, for `instanceId`.
 */
export async function cajaDelTurno(ctx: TurnoContext, estado: CajaEstado, instanceId: string): Promise<CajaEstado> {
  if (estado.instanceId === instanceId) return estado;
  const inst = estado.instances.find((i) => i.id === instanceId);
  if (!inst) return estado;
  const ventana = ventanaTurno({ date: estado.today, inicio: inst.inicio, tz: ctx.sede.tz, opened_at: inst.opened_at, closed_at: inst.closed_at });
  const pagos = await sumPagosVentana(ctx.admin, { orgId: ctx.organizationId, restaurantId: ctx.restaurantId, desde: ventana.desde, hasta: ventana.hasta });
  const prev = estado.base.cierre;
  return {
    ...estado,
    instanceId,
    ventana,
    pagos,
    finAt: localToUtc(estado.today, inst.fin.slice(0, 5), ctx.sede.tz).toISOString(),
    porValidar: prev && !prev.base_validada_at && prev.shift_instance_id !== instanceId ? prev : null,
  };
}

export interface HoyExtras {
  caja: { esperado: number; porValidar: boolean };
  acabando: { n: number; nombres: string[] };
}

/**
 * Caja + «se están acabando» for the Hoy screen. Loads in parallel with the
 * board; `enfocar(instanceId)` then centres the cash on the turno Hoy shows.
 */
export async function loadHoyExtras(ctx: TurnoContext): Promise<{ enfocar: (instanceId: string | null) => Promise<HoyExtras> }> {
  const today = todayInTz(ctx.sede.tz);
  const [estado, acab] = await Promise.all([
    loadCajaEstado(ctx.admin, { orgId: ctx.organizationId, restaurantId: ctx.restaurantId, tz: ctx.sede.tz, today }),
    loadAcabando(ctx.admin, ctx.organizationId),
  ]);
  const marcados = buildInsumos({ ...acab, today })
    .filter(marcado)
    .sort((a, b) => (a.marca === b.marca ? a.name.localeCompare(b.name, "es") : a.marca === "agotado" ? -1 : 1));
  return {
    enfocar: async (instanceId) => {
      const e = instanceId ? await cajaDelTurno(ctx, estado, instanceId) : estado;
      return {
        caja: { esperado: esperadoDe(e), porValidar: !!e.porValidar },
        acabando: { n: marcados.length, nombres: marcados.map((x) => x.name) },
      };
    },
  };
}

/**
 * Late items of the turno in play — the red badge on the «Tareas» tab — in
 * two light queries (pages other than Hoy/Tareas don't load the board).
 */
export async function contarAtrasadas(ctx: TurnoContext): Promise<number> {
  const date = todayInTz(ctx.sede.tz);
  const { data: rows } = await ctx.admin
    .from("shift_instances")
    .select("id, status, opened_by, template:checklist_templates!inner(id, inicio, fin, active, template_tasks(id, title, due_time, order_index, dias))")
    .eq("restaurant_id", ctx.restaurantId)
    .eq("date", date);
  type Row = { id: string; status: string; opened_by: string | null; template: { id: string; inicio: string; fin: string; active: boolean; template_tasks: TemplateTask[] } | { id: string; inicio: string; fin: string; active: boolean; template_tasks: TemplateTask[] }[] };
  const list = ((rows ?? []) as Row[])
    .map((r) => {
      const t = Array.isArray(r.template) ? r.template[0] : r.template;
      return t && t.active !== false ? { instance: { id: r.id, status: r.status, opened_by: r.opened_by }, template: { id: t.id, inicio: (t.inicio ?? "").slice(0, 5), fin: (t.fin ?? "").slice(0, 5) }, tasks: t.template_tasks ?? [] } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.template.inicio.localeCompare(b.template.inicio));
  const now = nowInTz(ctx.sede.tz);
  const cur = turnoActual(list, now);
  if (!cur || cur.instance.status === "closed") return 0;
  const [{ data: comps }, { data: adHoc }] = await Promise.all([
    ctx.admin.from("task_completions").select("template_task_id").eq("shift_instance_id", cur.instance.id),
    ctx.admin.from("ad_hoc_tasks").select("id, due_time, status, created_at").eq("shift_instance_id", cur.instance.id).eq("status", "pending"),
  ]);
  const done = new Set((comps ?? []).map((c) => c.template_task_id as string));
  const tasks = tareasDelDia(cur.tasks, date, done);
  return listaTareas({
    tasks,
    done: (t) => done.has(t.id),
    adHoc: (adHoc ?? []) as AdHocTask[],
    now,
    inicio: cur.template.inicio,
    fin: cur.template.fin,
  }).atrasadas;
}
