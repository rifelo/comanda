import { redirect } from "next/navigation";

/** A turno's old staff board → the team app's Hoy on that turno (PLAN §2.4). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/turno?turno=${encodeURIComponent(id)}`);
}
