import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { todayInTz } from "@/lib/utils";
import { HoyDia } from "./_components/hoy-dia";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hoy · Comanda" };

/**
 * The owner's home: today's numbers, caja, turnos and what needs attention
 * (Números + Hoy merged, docs/redesign/PLAN.md §2.3). Refreshes itself.
 */
export default async function HoyPage() {
  const [{ supabase, profile }, sede] = await Promise.all([requireAdmin(), getActiveSede()]);
  const date = todayInTz(sede?.tz ?? "America/Bogota");
  return <HoyDia db={supabase} orgId={profile.organization_id} sede={sede} date={date} />;
}
