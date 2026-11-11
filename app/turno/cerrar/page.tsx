import { redirect } from "next/navigation";
import { ensureTodayInstances, getTurnoBoard } from "@/lib/turno/server";
import { loadCajaEstado } from "@/lib/caja/estado";
import { faltaJustificar } from "@/lib/caja/arqueo";
import { esTurnoCorto } from "@/lib/caja/turno";
import { cajaDelTurno } from "@/lib/turno/reads";
import { NOMBRE_CONTEO } from "@/lib/inventario/rutina";
import { bloques, faltanLabel, hhmm, pasosCerrar, siguientePaso, tareasCierre, turnoActual } from "@/lib/turno/hoy";
import { assignedFor, turnoProgress } from "@/lib/turno/state";
import { nowInTz, todayInTz } from "@/lib/utils";
import { ahoraMs, param, requireEquipo, withQuery, type SearchParams } from "../_components/gate";
import { FlowFrame } from "../_components/flow";
import { loadConteoProps } from "../conteo/data";
import { CerrarStep, Entregado, type Resumen } from "./cerrar-step";
import { plata } from "../caja/_components/model";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cerrar el turno · Comanda" };

/**
 * «Cerrar el turno» (reference boards 9–11): 1 closing tasks (segmented by
 * time block, plus what is still pending from earlier) → 2 conteo rápido
 * (only the turno that closes the day owes it) → 3 arqueo → 4 base for
 * tomorrow (both the caja screen, embedded) → 5 entregar (novedades +
 * receipt + close) → «Turno entregado» with «Salir de la tablet».
 */
export default async function CerrarPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ctx = await requireEquipo(withQuery("/turno/cerrar", sp, ["turno", "paso"]));
  const today = todayInTz(ctx.sede.tz);
  await ensureTodayInstances(ctx, today);
  const [data, estadoSede] = await Promise.all([
    getTurnoBoard(ctx),
    loadCajaEstado(ctx.admin, { orgId: ctx.organizationId, restaurantId: ctx.restaurantId, tz: ctx.sede.tz, today }),
  ]);
  // Counting moved to the inventory assistant (2026-11-11): it decides what to
  // count and when, so closing a turno no longer owes a count.
  const rutina = { hecho: true, toca: "diario" as const };
  const now = nowInTz(ctx.sede.tz);
  const shift = turnoActual(data.turnos, now, {
    preferId: param(sp, "turno"),
    asignado: (t) => assignedFor(data.assignments, t.template.id, data.todayIdx, null) === ctx.actor.profileId,
  });
  if (!shift) redirect("/turno");
  // The arqueo of *this* turno, whatever turno the caja screen would pick by itself.
  const estado = await cajaDelTurno(ctx, estadoSede, shift.instance.id);
  const q = `?turno=${shift.instance.id}`;
  const { inicio, fin } = shift.template;
  const done = (id: string) => !!shift.completions[id];

  const cierreTasks = tareasCierre(shift.tasks, inicio, fin);
  const cierreIds = new Set(cierreTasks.map((t) => t.id));
  // Anything else still open (opening leftovers, mid-turno rounds) shows as its own segment.
  const pendientesAntes = shift.tasks.filter((t) => !cierreIds.has(t.id) && !done(t.id));
  const zonas = bloques(cierreTasks, 6, "z");

  const cierre = estado.existing[shift.instance.id];
  const vivo = cierre && cierre.status !== "rechazado" ? cierre : null;
  const debeConteo = false;
  const closed = shift.instance.status === "closed";
  const prog = turnoProgress(shift.tasks, shift.completions);

  const pedido = param(sp, "paso");
  const estadoPasos = {
    tareas: { hechas: cierreTasks.filter((t) => done(t.id)).length, total: cierreTasks.length },
    conteo: { debe: debeConteo, hecho: rutina.hecho, nombre: NOMBRE_CONTEO[rutina.toca] },
    // Sent and, when it has a difference, explained (the turno can't close otherwise).
    arqueo: !!vivo && !faltaJustificar(vivo),
    base: { lista: !!vivo?.base_confirmada_at, monto: plata(vivo?.base_dejada_cop ?? estado.base.monto) },
    entregado: closed,
    // A short task turno («Sacar la basura») doesn't count the drawer while a real turno runs today.
    caja: !(esTurnoCorto(shift.template) && estado.instances.some((i) => !esTurnoCorto(i))),
  };
  // `?despues=arqueo` (leaving the embedded caja): the first unfinished step from there on,
  // so a skipped count doesn't pull the person back once the cash is done.
  const despues = param(sp, "despues");
  const base0 = pasosCerrar(estadoPasos);
  const desde = Math.max(0, base0.findIndex((p) => p.key === despues));
  const auto = despues ? (base0.slice(desde).find((p) => p.state !== "done")?.key ?? "entregar") : null;
  const pasos = pasosCerrar({ ...estadoPasos, actual: pedido ?? auto });
  const resumen: Resumen = {
    turno: shift.template.name,
    quien: (shift.closed_by_name ?? ctx.actor.fullName).split(" ")[0],
    hora: closed && shift.instance.closed_at ? shift.instance.closed_at : null,
    tareas: { hechas: prog.done, total: prog.total },
    caja: vivo ? { contado: vivo.contado_cop, diferencia: vivo.pagos_count > 0 ? vivo.diferencia_cop : null } : null,
    base: vivo ? { monto: vivo.base_dejada_cop, lista: !!vivo.base_confirmada_at } : null,
    conteo: debeConteo ? (rutina.hecho ? "enviado" : "pendiente") : "no-toca",
    novedades: shift.novedades.length,
  };

  // «Turno entregado» — after closing, or when someone opens the flow of a closed turno.
  if (closed && (pedido === "fin" || !pedido)) {
    return <Entregado resumen={resumen} tz={ctx.sede.tz} viaDevice={ctx.actor.viaDevice} hoyHref={`/turno${q}`} />;
  }

  const actual = closed ? "entregar" : (pasos.find((p) => p.state === "now")?.key ?? "entregar");
  const href = (key: string) => `/turno/cerrar${q}&paso=${key}`;
  // Pin the step in the URL: a refresh after a tick must not move the person to another step.
  if (pedido !== actual) redirect(href(actual));
  const next = siguientePaso(pasos, actual);
  const conteoProps = actual === "conteo" && debeConteo && !rutina.hecho ? await loadConteoProps(ctx) : null;

  return (
    <FlowFrame
      title="Cerrar el turno"
      sub={`${shift.template.name} · ${ctx.actor.fullName.split(" ")[0]} · cierre a las ${hhmm(fin)}`}
      pasos={pasos}
      actual={actual}
      backHref={`/turno${q}`}
      hrefFor={href}
      falta={faltanLabel(now, hhmm(fin))}
      tz={ctx.sede.tz}
      serverNow={ahoraMs()}
      ancho={actual === "arqueo" || actual === "base" || actual === "conteo"}
    >
      <CerrarStep
        paso={actual}
        shift={shift}
        tz={ctx.sede.tz}
        restaurantId={ctx.restaurantId}
        zonas={zonas}
        pendientesAntes={pendientesAntes}
        conteo={{ debe: debeConteo, hecho: rutina.hecho, nombre: NOMBRE_CONTEO[rutina.toca], props: conteoProps }}
        estado={actual === "arqueo" || actual === "base" ? estado : null}
        actor={{ name: ctx.actor.fullName, isAdmin: ctx.actor.role === "admin" && !ctx.actor.viaDevice }}
        resumen={resumen}
        next={next ? { href: href(next.key), label: `Siguiente: ${next.title.toLowerCase()}` } : null}
        autoHref={`/turno/cerrar${q}&despues=arqueo`}
        finHref={`/turno/cerrar${q}&paso=fin`}
        tareasHref={href("tareas")}
      />
    </FlowFrame>
  );
}
