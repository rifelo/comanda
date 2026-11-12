import { redirect } from "next/navigation";
import { todayInTz } from "@/lib/utils";
import { resultadosDelDia, tareasPendientes } from "@/lib/inventario/agente/db";
import { requireEquipo } from "../../_components/gate";
import { planificarHoy } from "./plan";
import { VerificarScreen } from "./verificar-screen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Verificar inventario · Comanda" };

/**
 * «Verificar inventario»: the items the assistant asked the team to count
 * today, one per screen, blind. Full screen (no tab bar), like the canvas.
 * With nothing left it goes to «Listo» when something was verified today
 * (the server re-renders this page after the last answer), else back to the
 * hub.
 */
export default async function VerificarPage() {
  const ctx = await requireEquipo("/turno/inventario/verificar");
  const { admin, organizationId, sede } = ctx;
  const today = todayInTz(sede.tz);
  await planificarHoy(ctx, today);
  const tareas = await tareasPendientes(admin, organizationId, today);
  if (!tareas.length) {
    const hechas = await resultadosDelDia(admin, organizationId, today);
    redirect(hechas.length ? "/turno/inventario/verificar/listo" : "/turno/inventario");
  }
  return (
    <VerificarScreen
      tareas={tareas.map((t) => ({ id: t.id, name: t.name, unit: t.unit, ubicacion: t.ubicacion, pieza: t.pieza, packLabel: t.packLabel, nota: t.nota }))}
    />
  );
}
