import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getShift } from "@/lib/db/shifts";
import { listPuestos } from "@/lib/db/puestos";
import { ShiftForm } from "../../_components/shift-form";

export const dynamic = "force-dynamic";

export default async function EditarTurnoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireAdmin();
  const shift = await getShift(id);
  if (!shift) notFound();
  const puestoOptions = await listPuestos(shift.restaurant_id);

  return (
    <ShiftForm
      puestoOptions={puestoOptions}
      initial={{
        id: shift.id,
        name: shift.name,
        inicio: shift.inicio,
        fin: shift.fin,
        dias: shift.dias,
        tasks: shift.tasks.map((t) => ({
          id: t.id,
          title: t.title,
          instructions: t.instructions,
          due_time: t.due_time,
          requires_photo: t.requires_photo,
          puesto_id: t.puesto_id,
        })),
        puestos: shift.puestos.map((p) => ({
          puesto_id: p.puesto_id,
          position: p.position,
          waits_for_task_id: p.waits_for_task_id,
        })),
      }}
    />
  );
}
