import { requireAdmin } from "@/lib/auth";
import { getIngredientesView } from "@/lib/db/ingredients";
import { IngredientesClient } from "./ingredientes-client";

export const metadata = { title: "Productos · Ingredientes · co-manda" };

export default async function IngredientesPage() {
  const { profile, supabase } = await requireAdmin();

  // Pick the first restaurant in the org as the active sede. A proper
  // multi-sede selector lives in another phase — until then, ingredients
  // are scoped to whichever sede was created first.
  const { data: rests } = await supabase
    .from("restaurants")
    .select("id, name")
    .eq("organization_id", profile.organization_id)
    .order("created_at", { ascending: true })
    .limit(1);
  const active = rests?.[0] ?? null;

  if (!active) {
    return (
      <IngredientesClient
        key="no-sede"
        restaurantId={null}
        sedeName={null}
        initialCategories={[]}
        initialIngredients={[]}
      />
    );
  }

  const view = await getIngredientesView(active.id);

  return (
    <IngredientesClient
      key={active.id}
      restaurantId={active.id}
      sedeName={active.name}
      initialCategories={view.categories}
      initialIngredients={view.ingredients}
    />
  );
}
