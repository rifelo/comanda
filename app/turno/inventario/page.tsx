import { todayInTz } from "@/lib/utils";
import { loadAcabando } from "@/lib/inventario/acabando-db";
import { buildInsumos, contar } from "@/lib/inventario/acabando";
import { tareasPendientes } from "@/lib/inventario/agente/db";
import { contarAtrasadas } from "@/lib/turno/reads";
import { ahoraMs, actorOf, requireEquipo } from "../_components/gate";
import { EquipoShell } from "../_components/equipo";
import { AcabandoScreen } from "./acabando-screen";
import { planificarHoy } from "./verificar/plan";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inventario · Comanda" };

/**
 * «¿Qué se está acabando?» (reference board 8). Every item of the list, zone
 * by zone, one tap to say hay · poco · se acabó; what is in an open order
 * shows «en camino»; what is not on the list is added from here and the
 * owner orders it from Por pedir. On top, «Verificar insumos»: the items the
 * inventory assistant asks to count today (planned here the first time a
 * tablet opens it). Receiving and mermas keep their own screens.
 */
export default async function TurnoInventarioPage() {
  const ctx = await requireEquipo("/turno/inventario");
  const { admin, organizationId, sede } = ctx;
  const today = todayInTz(sede.tz);
  await planificarHoy(ctx, today);
  const [data, verificar, { count: porLlegar }, atrasadas] = await Promise.all([
    loadAcabando(admin, organizationId),
    tareasPendientes(admin, organizationId, today),
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
        verificar={verificar.map((t) => ({ id: t.id, name: t.name, ubicacion: t.ubicacion }))}
        porLlegar={porLlegar ?? 0}
      />
    </EquipoShell>
  );
}
