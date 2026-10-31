import { ensureTodayInstances, getTurnoBoard } from "@/lib/turno/server";
import { loadHoyExtras } from "@/lib/turno/reads";
import { turnoActual } from "@/lib/turno/hoy";
import { assignedFor } from "@/lib/turno/state";
import { nowInTz, todayInTz } from "@/lib/utils";
import { ahoraMs, actorOf, param, requireEquipo, withQuery, type SearchParams } from "./_components/gate";
import { HoyScreen } from "./hoy-screen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hoy · Comanda" };

/**
 * «Hoy» of the team app (reference board 1): what to do now, the cash the
 * drawer should hold, what is running out and when the turno closes. The
 * sede comes from the paired device (or the person's membership on their
 * phone); every tick is signed by the person in session.
 */
export default async function TurnoPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ctx = await requireEquipo(withQuery("/turno", sp, ["turno", "novedad"]));
  await ensureTodayInstances(ctx, todayInTz(ctx.sede.tz));
  const [data, hoyExtras] = await Promise.all([getTurnoBoard(ctx), loadHoyExtras(ctx)]);
  const now = nowInTz(ctx.sede.tz);
  const shift = turnoActual(data.turnos, now, {
    preferId: param(sp, "turno"),
    asignado: (t) => assignedFor(data.assignments, t.template.id, data.todayIdx, null) === ctx.actor.profileId,
  });
  const extras = await hoyExtras.enfocar(shift?.instance.id ?? null);
  return (
    <HoyScreen
      data={data}
      shiftId={shift?.instance.id ?? null}
      now={now}
      serverNow={ahoraMs()}
      extras={extras}
      actor={actorOf(ctx)}
      novedadAbierta={param(sp, "novedad") === "1"}
    />
  );
}
