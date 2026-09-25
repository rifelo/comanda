import { loadTurnoGate } from "@/lib/turno/server";
import { todayInTz } from "@/lib/utils";
import { buildRapido } from "@/lib/inventario/faltantes";
import { listFaltantesAbiertos, listRapido } from "@/lib/inventario/faltantes-db";
import { RapidoScreen } from "@/components/inventario/rapido-screen";
import { TurnoLogin } from "../_components/turno-login";
import { TurnoUnpaired } from "../unpaired";
import { reportarFaltantes } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Faltantes · co-manda" };

/**
 * Quick inventory on the shared tablet: the priority ingredients, one tap
 * per item (hay / poco / se acabó), one send. Shared screen with
 * /shift/[id]/inventario (components/inventario/rapido-screen.tsx).
 */
export default async function TurnoInventarioPage() {
  const gate = await loadTurnoGate();
  if (gate.kind === "unpaired") return <TurnoUnpaired next="/turno/inventario" />;
  if (gate.kind === "needs_login") return <TurnoLogin sedeName={gate.sede.name} error={gate.error} />;
  const { ctx } = gate;
  const today = todayInTz(ctx.sede.tz);
  const [ings, abiertos] = await Promise.all([listRapido(ctx.admin, ctx.organizationId), listFaltantesAbiertos(ctx.admin, ctx.organizationId)]);
  const isAdmin = ctx.actor.role === "admin" && !ctx.actor.viaDevice;
  return (
    <RapidoScreen
      actor={{ name: ctx.actor.fullName, isAdmin }}
      sedeName={ctx.sede.name}
      today={today}
      tz={ctx.sede.tz}
      view={buildRapido(ings, abiertos)}
      scope="turno"
      submit={reportarFaltantes}
      backHref="/turno"
      backLabel="Turno"
      panelHref="/inventario/faltantes"
      manageHref="/inventario/faltantes"
    />
  );
}
