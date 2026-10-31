import { requireAdmin } from "@/lib/auth";
import { getIngredientesView, listProveedores } from "@/lib/db/ingredients";
import { PageHeader } from "@/components/ui/top-bar";
import { NivelesClient } from "./niveles-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Niveles · Comanda" };

/**
 * Niveles: every inventory item on one editable sheet — where it is counted,
 * when it is "poco" and "se acabó", how much to order up to, who supplies it
 * and whether it goes in the quick daily count. These levels are what colour
 * the stock for the barista and what the shopping list is built from.
 */
export default async function NivelesPage() {
  const { profile } = await requireAdmin();
  const [view, proveedores] = await Promise.all([
    getIngredientesView(profile.organization_id),
    listProveedores(profile.organization_id),
  ]);
  return (
    <div>
      <PageHeader back="/inventario" title="Niveles de inventario" sub="Zona, presentación, cuándo es «poco» y «se acabó», hasta cuánto pedir y proveedor." />
      <NivelesClient ingredientes={view.ingredientes} categorias={view.categorias} proveedores={proveedores} />
    </div>
  );
}
