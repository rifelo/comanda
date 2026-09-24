import { loadTurnoGate } from "@/lib/turno/server";
import { todayInTz } from "@/lib/utils";
import { getCierreByInstance, lastBaseDejada, listInstancesForCaja } from "@/lib/caja/cierres";
import { TurnoLogin } from "../_components/turno-login";
import { TurnoUnpaired } from "../unpaired";
import { CajaScreen, type CajaExisting } from "./caja-screen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cierre de caja · co-manda" };

/**
 * End-of-shift cash close on the shared tablet, signed by whoever is logged
 * in. Blind: the person counts the drawer by denomination without seeing
 * what the POS expects; the comparison shows once the count is sent, and the
 * owner approves it from /hoy.
 */
export default async function CajaPage() {
  const gate = await loadTurnoGate();
  if (gate.kind === "unpaired") return <TurnoUnpaired next="/turno/caja" />;
  if (gate.kind === "needs_login") return <TurnoLogin sedeName={gate.sede.name} error={gate.error} />;
  const { ctx } = gate;
  const { admin } = ctx;
  const today = todayInTz(ctx.sede.tz);
  const [instances, baseSugerida] = await Promise.all([
    listInstancesForCaja(admin, ctx.restaurantId, today),
    lastBaseDejada(admin, ctx.restaurantId),
  ]);
  const existing: Record<string, CajaExisting> = {};
  await Promise.all(
    instances.map(async (i) => {
      const c = await getCierreByInstance(admin, ctx.organizationId, i.id);
      if (c) existing[i.id] = { status: c.status, contado: c.contado_cop, diferencia: c.diferencia_cop, submitted_at: c.submitted_at };
    }),
  );
  return (
    <CajaScreen
      actor={{ name: ctx.actor.fullName, isAdmin: ctx.actor.role === "admin" && !ctx.actor.viaDevice }}
      sedeName={ctx.sede.name}
      today={today}
      tz={ctx.sede.tz}
      instances={instances}
      baseSugerida={baseSugerida}
      existing={existing}
    />
  );
}
