import { requireAdmin } from "@/lib/auth";
import { getMovimientos } from "@/lib/db/movements";
import { getIngredientesView } from "@/lib/db/ingredients";
import { HistorialClient } from "./historial-client";

export const metadata = { title: "Operación · Movimientos · co-manda" };
export const dynamic = "force-dynamic";

export default async function HistorialPage() {
  const { profile } = await requireAdmin();
  const [movimientos, ingredientesView] = await Promise.all([
    getMovimientos(profile.organization_id),
    getIngredientesView(profile.organization_id),
  ]);
  const ingredientes = ingredientesView.ingredientes.map((i) => ({
    id: i.id,
    name: i.name,
    unit: i.unit,
  }));
  return <HistorialClient movimientos={movimientos} ingredientes={ingredientes} />;
}
