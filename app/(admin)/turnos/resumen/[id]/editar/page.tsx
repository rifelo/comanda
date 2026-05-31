import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getShift } from "@/lib/db/shifts";
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

  return (
    <ShiftForm
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
        })),
      }}
    />
  );
}
