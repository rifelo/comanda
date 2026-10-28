import { loadTurnoGate } from "@/lib/turno/server";
import { todayInTz } from "@/lib/utils";
import { loadCajaEstado } from "@/lib/caja/estado";
import { TurnoLogin } from "../_components/turno-login";
import { TurnoUnpaired } from "../unpaired";
import { CajaApp } from "./_components/caja-app";

export const dynamic = "force-dynamic";
export const metadata = { title: "Caja · co-manda" };

/**
 * Caja on the shared tablet, signed by whoever is logged in: what the
 * drawer should hold, every cash in and out with its «¿por qué?», the blind
 * arqueo at the close and the base check at the opening — one screen
 * (./_components/caja-app.tsx) so it keeps working without internet. The
 * owner reviews it all at /caja.
 */
export default async function CajaPage() {
  const gate = await loadTurnoGate();
  if (gate.kind === "unpaired") return <TurnoUnpaired next="/turno/caja" />;
  if (gate.kind === "needs_login") return <TurnoLogin sedeName={gate.sede.name} error={gate.error} />;
  const { ctx } = gate;
  const estado = await loadCajaEstado(ctx.admin, { orgId: ctx.organizationId, restaurantId: ctx.restaurantId, tz: ctx.sede.tz, today: todayInTz(ctx.sede.tz) });
  return <CajaApp estado={estado} sedeName={ctx.sede.name} tz={ctx.sede.tz} actor={{ name: ctx.actor.fullName, isAdmin: ctx.actor.role === "admin" && !ctx.actor.viaDevice }} />;
}
