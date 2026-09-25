import { loadTurnoGate } from "@/lib/turno/server";
import { todayInTz } from "@/lib/utils";
import { baseSugerida, getCierreByInstance, listCierresSede, listInstancesForCaja } from "@/lib/caja/cierres";
import { CajaScreen } from "@/components/caja/caja-screen";
import { TurnoLogin } from "../_components/turno-login";
import { TurnoUnpaired } from "../unpaired";
import type { CajaCierre } from "@/lib/types";
import { confirmarBaseCaja, enviarCierreCaja, validarBaseCaja } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cierre de caja · co-manda" };

/**
 * End-of-shift cash close on the shared tablet, signed by whoever is logged
 * in. Blind: the person counts the drawer by denomination without seeing
 * what the POS expects; the comparison shows once the count is sent, and the
 * owner approves it from /hoy. The screen itself is shared with
 * /shift/[id]/caja (components/caja/caja-screen.tsx).
 */
export default async function CajaPage() {
  const gate = await loadTurnoGate();
  if (gate.kind === "unpaired") return <TurnoUnpaired next="/turno/caja" />;
  if (gate.kind === "needs_login") return <TurnoLogin sedeName={gate.sede.name} error={gate.error} />;
  const { ctx } = gate;
  const { admin } = ctx;
  const today = todayInTz(ctx.sede.tz);
  const [instances, sugerida, historial] = await Promise.all([
    listInstancesForCaja(admin, ctx.restaurantId, today),
    baseSugerida(admin, ctx.restaurantId),
    listCierresSede(admin, ctx.restaurantId, 10),
  ]);
  const existing: Record<string, CajaCierre> = {};
  await Promise.all(
    instances.map(async (i) => {
      const c = await getCierreByInstance(admin, ctx.organizationId, i.id);
      if (c) existing[i.id] = c;
    }),
  );
  return (
    <CajaScreen
      actor={{ name: ctx.actor.fullName, isAdmin: ctx.actor.role === "admin" && !ctx.actor.viaDevice }}
      sedeName={ctx.sede.name}
      today={today}
      tz={ctx.sede.tz}
      instances={instances}
      baseSugerida={sugerida}
      existing={existing}
      historial={historial}
      submit={enviarCierreCaja}
      confirmBase={confirmarBaseCaja}
      validateBase={validarBaseCaja}
      backHref="/turno"
      backLabel="Turno"
      panelHref={`/hoy/${today}`}
    />
  );
}
