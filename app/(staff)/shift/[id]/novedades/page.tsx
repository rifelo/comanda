import { redirect } from "next/navigation";

/** Novedades are a sheet on the team app's Hoy (PLAN §2.4): `?novedad=1` opens it. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/turno?turno=${encodeURIComponent(id)}&novedad=1`);
}
