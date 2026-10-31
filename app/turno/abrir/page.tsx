import { redirect } from "next/navigation";
import { ensureTodayInstances, getTurnoBoard } from "@/lib/turno/server";
import { loadCajaEstado } from "@/lib/caja/estado";
import { cajaDelTurno } from "@/lib/turno/reads";
import { bloques, faltanLabel, horaApertura, pasosAbrir, siguientePaso, tareaApertura, tareasApertura, turnoActual } from "@/lib/turno/hoy";
import { assignedFor } from "@/lib/turno/state";
import { nowInTz, todayInTz } from "@/lib/utils";
import { ahoraMs, param, requireEquipo, withQuery, type SearchParams } from "../_components/gate";
import { FlowFrame } from "../_components/flow";
import { AbrirStep } from "./abrir-step";

export const dynamic = "force-dynamic";
export const metadata = { title: "Abrir el turno · Comanda" };

/**
 * «Abrir el turno» (reference boards 5 + 6): 1 · validate the base the last
 * close left (the caja screen, embedded) → the opening tasks in blocks cut
 * from their due times → «Abrir al público». `?paso=` picks a step; without
 * it the first unfinished one opens.
 */
export default async function AbrirPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ctx = await requireEquipo(withQuery("/turno/abrir", sp, ["turno", "paso"]));
  const today = todayInTz(ctx.sede.tz);
  await ensureTodayInstances(ctx, today);
  const [data, estadoSede] = await Promise.all([
    getTurnoBoard(ctx),
    loadCajaEstado(ctx.admin, { orgId: ctx.organizationId, restaurantId: ctx.restaurantId, tz: ctx.sede.tz, today }),
  ]);
  const now = nowInTz(ctx.sede.tz);
  const shift = turnoActual(data.turnos, now, {
    preferId: param(sp, "turno"),
    asignado: (t) => assignedFor(data.assignments, t.template.id, data.todayIdx, null) === ctx.actor.profileId,
  });
  if (!shift) redirect("/turno");
  const estado = await cajaDelTurno(ctx, estadoSede, shift.instance.id);
  const q = `?turno=${shift.instance.id}`;
  if (shift.instance.status === "closed") redirect(`/turno${q}`);

  const { inicio, fin } = shift.template;
  const done = (id: string) => !!shift.completions[id];
  const bl = bloques(tareasApertura(shift.tasks, inicio, fin), 6);
  const abrirTask = tareaApertura(shift.tasks);
  const apertura = horaApertura(shift.tasks, inicio);
  const blocksDone = bl.every((b) => b.tasks.every((t) => done(t.id)));
  const abierto = abrirTask ? done(abrirTask.id) : !!shift.instance.opened_by && blocksDone;
  const pasos = pasosAbrir({
    baseLista: !estado.porValidar,
    bloques: bl.map((b) => ({ key: b.key, titulo: b.titulo, total: b.tasks.length, hechas: b.tasks.filter((t) => done(t.id)).length })),
    apertura,
    abierto,
    actual: param(sp, "paso"),
  });
  const actual = pasos.find((p) => p.state === "now")?.key ?? "abrir";
  const href = (key: string) => `/turno/abrir${q}&paso=${key}`;
  // Pin the step in the URL: a refresh after a tick must not move the person to another step.
  if (param(sp, "paso") !== actual) redirect(href(actual));
  const next = siguientePaso(pasos, actual);

  return (
    <FlowFrame
      title="Abrir el turno"
      sub={`${shift.template.name} · abres al público a las ${apertura}`}
      pasos={pasos}
      actual={actual}
      backHref={`/turno${q}`}
      hrefFor={href}
      falta={faltanLabel(now, apertura)}
      tz={ctx.sede.tz}
      serverNow={ahoraMs()}
      ancho={actual === "base" && !!estado.porValidar}
    >
      <AbrirStep
        paso={actual}
        titulo={pasos.find((p) => p.key === actual)?.title ?? ""}
        shift={shift}
        tz={ctx.sede.tz}
        restaurantId={ctx.restaurantId}
        bloque={bl.find((b) => b.key === actual) ?? null}
        abrirTask={abrirTask}
        pendientesApertura={bl.reduce((n, b) => n + b.tasks.filter((t) => !done(t.id)).length, 0)}
        estado={actual === "base" ? estado : null}
        actor={{ name: ctx.actor.fullName, isAdmin: ctx.actor.role === "admin" && !ctx.actor.viaDevice }}
        next={next ? { href: href(next.key), label: `Siguiente: ${next.title.toLowerCase()}` } : null}
        hoyHref={`/turno${q}`}
      />
    </FlowFrame>
  );
}
