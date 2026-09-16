import { requireAdmin } from "@/lib/auth";
import { getRecetasView } from "@/lib/db/recetas";
import { RecetasClient } from "./recetas-client";

export const metadata = { title: "Operación · Recetas · co-manda" };
export const dynamic = "force-dynamic";

export default async function RecetasPage() {
  const { profile } = await requireAdmin();
  const view = await getRecetasView(profile.organization_id);
  return <RecetasClient view={view} />;
}
