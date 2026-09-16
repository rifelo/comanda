import { requireAdmin } from "@/lib/auth";
import { getIngredientesView } from "@/lib/db/ingredients";
import { InventarioClient } from "./inventario-client";

export const metadata = { title: "Operación · Inventario · co-manda" };

export default async function InventarioPage() {
  const { profile } = await requireAdmin();
  const view = await getIngredientesView(profile.organization_id);

  return (
    <InventarioClient
      key={profile.organization_id}
      initialCategorias={view.categorias}
      initialIngredientes={view.ingredientes}
    />
  );
}
