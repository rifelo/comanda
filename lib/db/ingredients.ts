import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Ingrediente, IngredienteCategoria, Proveedor } from "@/lib/types";

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
        "id, organization_id, category_id, name, unit, unit2, conversion_factor, stock_current, stock_min, merma_pct, cost_cop, pack_cost_cop, pack_qty, archived, conteo_diario, prioridad, stock_critico, stock_objetivo, ubicacion, pack_label, proveedor_id, controla_vencimiento",
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

/** The org's suppliers, active ones only, by name. */
export async function listProveedores(organizationId: string): Promise<Proveedor[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("proveedores")
    .select("id, organization_id, name, whatsapp, dias_pedido, notas, archived")
    .eq("organization_id", organizationId)
    .eq("archived", false)
    .order("name");
  return (data ?? []) as Proveedor[];
}
