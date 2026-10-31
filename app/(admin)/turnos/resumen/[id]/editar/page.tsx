import { forward, type ForwardProps } from "@/app/(admin)/equipo/_lib/forward";

/** Moved in the redesign (docs/redesign/PLAN.md §2.4): /equipo/turnos/[id]/editar. */
export default async function Moved({ params, searchParams }: ForwardProps & { params: Promise<{ id: string }> }) {
  const { id } = await params;
  forward(`/equipo/turnos/${encodeURIComponent(id)}/editar`, await searchParams);
}
