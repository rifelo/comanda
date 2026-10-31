import { todayInTz } from "@/lib/utils";
import { loadRutina } from "@/lib/inventario/conteos";
import { loadAcabando } from "@/lib/inventario/acabando-db";
import { buildInsumos, contar } from "@/lib/inventario/acabando";
import { NOMBRE_CONTEO } from "@/lib/inventario/rutina";
import { contarAtrasadas } from "@/lib/turno/reads";
import { ahoraMs, actorOf, requireEquipo } from "../_components/gate";
import { EquipoShell } from "../_components/equipo";
import { AcabandoScreen } from "./acabando-screen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inventario · Comanda" };

/**
 * «¿Qué se está acabando?» (reference board 8). Every item of the list, zone
 * by zone, one tap to say hay · poco · se acabó; what is in an open order
 * shows «en camino»; what is not on the list is added from here and the
 * owner orders it from Por pedir. Count, receiving and mermas keep their own
 * screens, one tap away.
 */
export default async function TurnoInventarioPage() {
  const ctx = await requireEquipo("/turno/inventario");
  const { admin, organizationId, sede } = ctx;
  const today = todayInTz(sede.tz);
  const [data, estado, { count: porLlegar }, atrasadas] = await Promise.all([
    loadAcabando(admin, organizationId),
    loadRutina(admin, organizationId, sede.tz),
    admin.from("compras").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "pedido"),
    contarAtrasadas(ctx),
  ]);
  const c = contar(buildInsumos({ ...data, today }));
  const avisados = c.poco + c.agotado;
  return (
    <EquipoShell
      title="¿Qué se está acabando?"
      sub={avisados ? `${avisados} ${avisados === 1 ? "avisado" : "avisados"}${c.camino ? ` · ${c.camino} en camino` : ""}` : "Nada avisado"}
      actor={actorOf(ctx)}
      tz={sede.tz}
      serverNow={ahoraMs()}
      atrasadas={atrasadas}
    >
      <AcabandoScreen
        data={data}
        today={today}
        actorName={ctx.actor.fullName}
        isAdmin={ctx.actor.role === "admin" && !ctx.actor.viaDevice}
        conteo={{ pendiente: !estado.rutina.hecho, nombre: NOMBRE_CONTEO[estado.rutina.toca] }}
        porLlegar={porLlegar ?? 0}
      />
    </EquipoShell>
  );
}
