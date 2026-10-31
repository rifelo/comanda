import { redirect } from "next/navigation";
import { loadTurnoGate, turnoLoginHref } from "@/lib/turno/server";
import { todayInTz } from "@/lib/utils";
import { loadRutina } from "@/lib/inventario/conteos";
import { loadAcabando } from "@/lib/inventario/acabando-db";
import { NOMBRE_CONTEO } from "@/lib/inventario/rutina";
import { AcabandoScreen } from "./acabando-screen";

export const dynamic = "force-dynamic";
export const metadata = { title: "¿Qué se está acabando? · co-manda" };

/**
 * Inventory on the shared tablet: «¿Qué se está acabando?». Every item of
 * the list, zone by zone, one tap to say hay · poco · agotado; what is in an
 * open order shows «en camino»; what is not on the list is added from here
 * and the owner orders it from Por pedir (/compras on the phone). The count,
 * receiving an order and mermas keep their own screens, one tap away.
 */
export default async function TurnoInventarioPage() {
  const gate = await loadTurnoGate();
  if (gate.kind !== "ready") redirect(turnoLoginHref(gate, "/turno/inventario"));
  const { ctx } = gate;
  const { admin, organizationId, sede } = ctx;
  const [data, estado, { count: porLlegar }] = await Promise.all([
    loadAcabando(admin, organizationId),
    loadRutina(admin, organizationId, sede.tz),
    admin.from("compras").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "pedido"),
  ]);
  return (
    <AcabandoScreen
      data={data}
      today={todayInTz(sede.tz)}
      actorName={ctx.actor.fullName}
      isAdmin={ctx.actor.role === "admin" && !ctx.actor.viaDevice}
      conteo={{ pendiente: !estado.rutina.hecho, nombre: NOMBRE_CONTEO[estado.rutina.toca] }}
      porLlegar={porLlegar ?? 0}
    />
  );
}
