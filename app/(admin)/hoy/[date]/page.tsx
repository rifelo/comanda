import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { esFecha } from "@/lib/numeros/dia";
import { todayInTz } from "@/lib/utils";
import { HoyDia } from "../_components/hoy-dia";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hoy · Comanda" };

/**
 * Any past day on the owner's Hoy (ex /numeros/[fecha]). Today or a future
 * day go back to /hoy. The old turno detail lived here: links that still
 * carry `?turno=` land on /hoy/[date]/turnos.
 */
export default async function HoyFechaPage({
  params,
  searchParams,
}: {
  params: Promise<{ date: string }>;
  searchParams: Promise<{ turno?: string }>;
}) {
  const [{ date }, { turno }] = await Promise.all([params, searchParams]);
  if (!esFecha(date)) notFound();
  if (turno) redirect(`/hoy/${date}/turnos?turno=${encodeURIComponent(turno)}`);
  const [{ supabase, profile }, sede] = await Promise.all([requireAdmin(), getActiveSede()]);
  if (date >= todayInTz(sede?.tz ?? "America/Bogota")) redirect("/hoy");
  return <HoyDia db={supabase} orgId={profile.organization_id} sede={sede} date={date} />;
}
