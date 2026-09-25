import { notFound } from "next/navigation";
import { loadShiftToolContext } from "@/lib/shift/staff";
import { todayInTz } from "@/lib/utils";
import { baseSugerida, getCierreByInstance, listCierresSede, type CajaInstance } from "@/lib/caja/cierres";
import { CajaScreen, type CajaExisting } from "@/components/caja/caja-screen";
import { enviarCierreCajaShift } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cierre de caja · co-manda" };

/**
 * The arqueo opened from a person's own shift screen (/shift/[id]). Same
 * screen and rules as Turno → Caja on the shop tablet, pinned to this turno.
 */
export default async function ShiftCajaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadShiftToolContext(id);
  if (!ctx) notFound();
  const { admin, instance } = ctx;
  const [cierre, sugerida, historial] = await Promise.all([
    getCierreByInstance(admin, ctx.organizationId, instance.id),
    baseSugerida(admin, ctx.restaurantId),
    listCierresSede(admin, ctx.restaurantId, 10),
  ]);
  const instances: CajaInstance[] = [
    {
      id: instance.id,
      status: instance.status,
      opened_at: instance.opened_at,
      closed_at: instance.closed_at,
      template_name: instance.template_name,
      inicio: instance.inicio,
      fin: instance.fin,
    },
  ];
  const existing: Record<string, CajaExisting> = {};
  if (cierre) existing[instance.id] = { status: cierre.status, contado: cierre.contado_cop, diferencia: cierre.diferencia_cop, submitted_at: cierre.submitted_at };
  return (
    <CajaScreen
      actor={{ name: ctx.actor.fullName, isAdmin: ctx.actor.role === "admin" }}
      sedeName={ctx.sede.name}
      today={todayInTz(ctx.sede.tz)}
      tz={ctx.sede.tz}
      instances={instances}
      baseSugerida={sugerida}
      existing={existing}
      historial={historial}
      submit={enviarCierreCajaShift}
      backHref={`/shift/${instance.id}`}
      backLabel="Turno"
      panelHref={`/hoy/${instance.date}?turno=${instance.id}`}
    />
  );
}
