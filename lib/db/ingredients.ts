import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Ingrediente, IngredienteCategoria } from "@/lib/types";

export interface IngredientesView {
  categorias: IngredienteCategoria[];
  ingredientes: Ingrediente[];
}

export async function getIngredientesView(
  organizationId: string,
): Promise<IngredientesView> {
  const supabase = await createSupabaseServerClient();
  const [cats, ings] = await Promise.all([
    supabase
      .from("ingrediente_categorias")
      .select("id, organization_id, parent_id, label, position")
      .eq("organization_id", organizationId)
      .order("position")
      .order("label"),
    supabase
      .from("ingredientes")
      .select(
        "id, organization_id, category_id, name, unit, unit2, conversion_factor, stock_current, stock_min, merma_pct, cost_cop, pack_cost_cop, pack_qty, archived, conteo_diario",
      )
      .eq("organization_id", organizationId)
      .eq("archived", false)
      .order("name"),
  ]);
  return {
    categorias: (cats.data ?? []) as IngredienteCategoria[],
    ingredientes: (ings.data ?? []) as Ingrediente[],
  };
}
