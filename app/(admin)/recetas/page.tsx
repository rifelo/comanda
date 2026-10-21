import { requireAdmin } from "@/lib/auth";
import { getRecetasView } from "@/lib/db/recetas";
import { RecetasClient } from "./recetas-client";

export const metadata = { title: "Operación · Recetas · co-manda" };
export const dynamic = "force-dynamic";

// ?producto=<id> opens that product's recipe straight away (from Catálogo or
// the POS recipe sheet); without a recipe yet, «Nueva receta» opens with it.
export default async function RecetasPage({ searchParams }: { searchParams: Promise<{ producto?: string }> }) {
  const [{ profile }, sp] = await Promise.all([requireAdmin(), searchParams]);
  const view = await getRecetasView(profile.organization_id);
  return <RecetasClient key={sp.producto ?? ""} view={view} producto={sp.producto ?? null} />;
}
