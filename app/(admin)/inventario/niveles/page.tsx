import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getIngredientesView, listProveedores } from "@/lib/db/ingredients";
import { TurnosHeader } from "../../_components/turnos-header";
import { NivelesClient } from "./niveles-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Operación · Niveles de inventario · co-manda" };

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
      <TurnosHeader kicker="OPERACIÓN · INVENTARIO" title="Niveles de inventario">
        <Link href="/inventario" className="cmd-btn ghost sm" style={{ textDecoration: "none" }}>← Inventario</Link>
      </TurnosHeader>
      <NivelesClient ingredientes={view.ingredientes} categorias={view.categorias} proveedores={proveedores} />
    </div>
  );
}
