import { requireAdmin } from "@/lib/auth";
import { getIngredientesView } from "@/lib/db/ingredients";
import { IngredientesClient } from "./ingredientes-client";

export const metadata = { title: "Productos · Ingredientes · co-manda" };

export default async function IngredientesPage() {
  const { profile } = await requireAdmin();
  const view = await getIngredientesView(profile.organization_id);

  return (
    <IngredientesClient
      key={profile.organization_id}
      initialCategorias={view.categorias}
      initialIngredientes={view.ingredientes}
    />
  );
}
