import { redirect } from "next/navigation";
import { ensureTodayInstances, getTurnoBoard, loadTurnoGate, turnoLoginHref } from "@/lib/turno/server";
import { loadRutina } from "@/lib/inventario/conteos";
import { baseSugerida } from "@/lib/caja/cierres";
import { nowInTz, todayInTz } from "@/lib/utils";
import { TurnoBoard } from "./turno-board";

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
  if (gate.kind !== "ready") redirect(turnoLoginHref(gate, "/turno"));
  const { ctx } = gate;
  await ensureTodayInstances(ctx, todayInTz(ctx.sede.tz));
  const [data, { rutina }, base] = await Promise.all([getTurnoBoard(ctx), loadRutina(ctx.admin, ctx.organizationId, ctx.sede.tz), baseSugerida(ctx.admin, ctx.restaurantId)]);
  // The base the last close left, still unchecked by whoever opened after it: Caja shows a dot.
  const abiertos = data.turnos.filter((t) => t.instance.status === "open").map((t) => t.instance.id);
  const cajaPendiente = !!base.cierre && !base.cierre.base_validada_at && !abiertos.includes(base.cierre.shift_instance_id ?? "");
  return <TurnoBoard data={data} actor={ctx.actor} serverNow={nowInTz(ctx.sede.tz)} rutina={rutina} cajaPendiente={cajaPendiente} />;
}
