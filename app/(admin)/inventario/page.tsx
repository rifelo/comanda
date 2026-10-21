import { requireAdmin } from "@/lib/auth";
import { getIngredientesView } from "@/lib/db/ingredients";
import { getCostosPendientes } from "@/lib/db/costos-pendientes";
import { InventarioClient } from "./inventario-client";

export const metadata = { title: "Operación · Inventario · co-manda" };

export default async function InventarioPage() {
  const { profile, supabase } = await requireAdmin();
  const [view, costos] = await Promise.all([getIngredientesView(profile.organization_id), getCostosPendientes(supabase, profile.organization_id)]);

  return (
    <InventarioClient
      key={profile.organization_id}
      initialCategorias={view.categorias}
      initialIngredientes={view.ingredientes}
      costos={costos}
    />
  );
}
