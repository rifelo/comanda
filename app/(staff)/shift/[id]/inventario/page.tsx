import { notFound } from "next/navigation";
import { loadShiftToolContext } from "@/lib/shift/staff";
import { todayInTz } from "@/lib/utils";
import { buildRapido } from "@/lib/inventario/faltantes";
import { listFaltantesAbiertos, listRapido } from "@/lib/inventario/faltantes-db";
import { RapidoScreen, type RapidoInput } from "@/components/inventario/rapido-screen";
import { reportarFaltantesShift } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Faltantes · co-manda" };

/** The quick inventory opened from a person's own shift screen (/shift/[id]). */
export default async function ShiftInventarioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadShiftToolContext(id);
  if (!ctx) notFound();
  const [ings, abiertos] = await Promise.all([listRapido(ctx.admin, ctx.organizationId), listFaltantesAbiertos(ctx.admin, ctx.organizationId)]);
  const shiftId = ctx.instance.id;
  async function submit(input: RapidoInput) {
    "use server";
    return reportarFaltantesShift({ shiftInstanceId: shiftId, items: input.items });
  }
  return (
    <RapidoScreen
      actor={{ name: ctx.actor.fullName, isAdmin: ctx.actor.role === "admin" }}
      sedeName={ctx.sede.name}
      today={todayInTz(ctx.sede.tz)}
      tz={ctx.sede.tz}
      view={buildRapido(ings, abiertos)}
      scope={`shift:${shiftId}`}
      submit={submit}
      backHref={`/shift/${shiftId}`}
      backLabel="Turno"
      panelHref="/inventario/faltantes"
      manageHref="/inventario/faltantes"
    />
  );
}
