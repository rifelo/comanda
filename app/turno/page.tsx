import { ensureTodayInstances, getTurnoBoard, loadTurnoGate } from "@/lib/turno/server";
import { nowInTz, todayInTz } from "@/lib/utils";
import { TurnoLogin } from "./_components/turno-login";
import { TurnoBoard } from "./turno-board";
import { TurnoUnpaired } from "./unpaired";

export const dynamic = "force-dynamic";
export const metadata = { title: "Turno · co-manda" };

/**
 * Shared shift tablet. A paired device (POS pairing cookie) fixes the sede;
 * the person in charge signs in with email + password and works today's
 * checklist under their own name. A signed-in admin on a laptop lands here
 * too, with their org's first sede.
 */
export default async function TurnoPage() {
  const gate = await loadTurnoGate();
  if (gate.kind === "unpaired") return <TurnoUnpaired />;
  if (gate.kind === "needs_login") return <TurnoLogin sedeName={gate.sede.name} error={gate.error} />;
  const { ctx } = gate;
  await ensureTodayInstances(ctx, todayInTz(ctx.sede.tz));
  const data = await getTurnoBoard(ctx);
  return <TurnoBoard data={data} actor={ctx.actor} serverNow={nowInTz(ctx.sede.tz)} />;
}
