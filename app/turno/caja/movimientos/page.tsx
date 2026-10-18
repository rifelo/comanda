import { loadTurnoGate } from "@/lib/turno/server";
import { formatTime, todayInTz } from "@/lib/utils";
import { inicioDia } from "@/lib/inventario/mermas-db";
import { listMovimientos } from "@/lib/caja/movimientos-db";
import { TurnoLogin } from "../../_components/turno-login";
import { TurnoUnpaired } from "../../unpaired";
import { MovimientosScreen } from "./movimientos-screen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ingresos y salidas de caja · co-manda" };

/**
 * Cash in and out of the drawer on the shared tablet: the sencillo someone
 * deposits to operate, a small purchase paid from the till, a withdrawal —
 * each with its justification, signed by whoever is logged in. Today's list
 * and totals below; the cash close counts them in its expected amount.
 */
export default async function MovimientosCajaPage() {
  const gate = await loadTurnoGate();
  if (gate.kind === "unpaired") return <TurnoUnpaired next="/turno/caja/movimientos" />;
  if (gate.kind === "needs_login") return <TurnoLogin sedeName={gate.sede.name} error={gate.error} />;
  const { ctx } = gate;
  const today = todayInTz(ctx.sede.tz);
  const hoy = await listMovimientos(ctx.admin, { orgId: ctx.organizationId, restaurantId: ctx.restaurantId }, inicioDia(today), 100);
  return (
    <MovimientosScreen
      sedeName={ctx.sede.name}
      actorName={ctx.actor.fullName}
      hoy={hoy.map((m) => ({ id: m.id, tipo: m.tipo, monto: m.monto, motivo: m.motivo, justificacion: m.justificacion, folio: m.compraFolio, quien: m.by, hora: formatTime(new Date(m.createdAt), ctx.sede.tz) }))}
    />
  );
}
