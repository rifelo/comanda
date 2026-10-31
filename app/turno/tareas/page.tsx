import { ensureTodayInstances, getTurnoBoard } from "@/lib/turno/server";
import { turnoActual } from "@/lib/turno/hoy";
import { assignedFor } from "@/lib/turno/state";
import { nowInTz, todayInTz } from "@/lib/utils";
import { ahoraMs, actorOf, param, requireEquipo, withQuery, type SearchParams } from "../_components/gate";
import { TareasScreen } from "./tareas-screen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tareas · Comanda" };

/** «Tareas» (reference board 2): the whole list of the turno, Pendientes / Hechas. */
export default async function TareasPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ctx = await requireEquipo(withQuery("/turno/tareas", sp, ["turno", "ver"]));
  await ensureTodayInstances(ctx, todayInTz(ctx.sede.tz));
  const data = await getTurnoBoard(ctx);
  const now = nowInTz(ctx.sede.tz);
  const shift = turnoActual(data.turnos, now, {
    preferId: param(sp, "turno"),
    asignado: (t) => assignedFor(data.assignments, t.template.id, data.todayIdx, null) === ctx.actor.profileId,
  });
  return (
    <TareasScreen
      data={data}
      shiftId={shift?.instance.id ?? null}
      now={now}
      serverNow={ahoraMs()}
      actor={actorOf(ctx)}
      ver={param(sp, "ver") === "hechas" ? "hechas" : "pendientes"}
    />
  );
}
