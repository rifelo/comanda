import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Ingredient, IngredientCategory } from "@/lib/types";

export interface IngredientesView {
  categories: IngredientCategory[];
  ingredients: Ingredient[];
}

export async function getIngredientesView(
  restaurantId: string,
): Promise<IngredientesView> {
  const supabase = await createSupabaseServerClient();
  const [cats, ings] = await Promise.all([
    supabase
      .from("ingredient_categories")
      .select("id, restaurant_id, parent_id, name, depth, sort_index")
      .eq("restaurant_id", restaurantId)
      .order("depth")
      .order("sort_index")
      .order("name"),
    supabase
      .from("ingredients")
      .select(
        "id, restaurant_id, category_id, parent_ingredient_id, name, unit, stock_current, stock_min, merma_pct, cost_per_unit, archived",
      )
      .eq("restaurant_id", restaurantId)
      .eq("archived", false)
      .order("name"),
  ]);
  return {
    categories: (cats.data ?? []) as IngredientCategory[],
    ingredients: (ings.data ?? []) as Ingredient[],
  };
}
