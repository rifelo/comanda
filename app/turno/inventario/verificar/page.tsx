import { redirect } from "next/navigation";
import { todayInTz } from "@/lib/utils";
import { resultadosDelDia, tareasPendientes } from "@/lib/inventario/agente/db";
import { requireEquipo } from "../../_components/gate";
import { planificarHoy, volverSeguro } from "./plan";
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
export default async function VerificarPage({ searchParams }: { searchParams: Promise<{ volver?: string }> }) {
  const volver = volverSeguro((await searchParams).volver);
  const ctx = await requireEquipo(volver ? `/turno/inventario/verificar?volver=${encodeURIComponent(volver)}` : "/turno/inventario/verificar");
  const { admin, organizationId, sede } = ctx;
  const today = todayInTz(sede.tz);
  await planificarHoy(ctx, today);
  const tareas = await tareasPendientes(admin, organizationId, today);
  if (!tareas.length) {
    const hechas = await resultadosDelDia(admin, organizationId, today);
    if (!hechas.length) redirect(volver ?? "/turno/inventario");
    redirect(volver ? `/turno/inventario/verificar/listo?volver=${encodeURIComponent(volver)}` : "/turno/inventario/verificar/listo");
  }
  return (
    <VerificarScreen
      volver={volver}
      tareas={tareas.map((t) => ({ id: t.id, name: t.name, unit: t.unit, ubicacion: t.ubicacion, pieza: t.pieza, packLabel: t.packLabel, nota: t.nota }))}
    />
  );
}
