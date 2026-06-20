import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getIngredientesView } from "@/lib/db/ingredients";
import { ImportarFacturaClient } from "./importar-factura-client";

export const metadata: Metadata = { title: "Importar factura · comanda" };

/**
 * Importar factura → inventario. Upload a purchase-invoice photo; Claude reads
 * the line items and the admin reviews/edits before bulk-creating ingredientes
 * (packs auto-derive their per-unit cost via the "comprado por paquete" rule).
 */
export default async function ImportarFacturaPage() {
  const { profile } = await requireAdmin();
  const view = await getIngredientesView(profile.organization_id);

  // Flatten categories to breadcrumb labels for the per-row category picker.
  const byId = new Map(view.categorias.map((c) => [c.id, c]));
  const categorias = view.categorias
    .map((c) => {
      const parent = c.parent_id ? byId.get(c.parent_id) : null;
      return {
        id: c.id,
        label: parent ? `${parent.label} · ${c.label}` : c.label,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "es"));

  return <ImportarFacturaClient categorias={categorias} />;
}
