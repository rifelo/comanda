import { requireAdmin } from "@/lib/auth";
import { getIngredientesView } from "@/lib/db/ingredients";
import { buildAlertas } from "@/lib/notificaciones";
import { NotificacionesClient } from "./notificaciones-client";

export const metadata = { title: "Productos · Notificaciones · co-manda" };
export const dynamic = "force-dynamic";

export default async function NotificacionesPage() {
  const { profile } = await requireAdmin();
  const { ingredientes, categorias } = await getIngredientesView(
    profile.organization_id,
  );
  const view = buildAlertas(
    ingredientes.map((i) => ({
      id: i.id,
      name: i.name,
      unit: i.unit,
      category_id: i.category_id,
      stock_current: i.stock_current,
      stock_min: i.stock_min,
    })),
    categorias.map((c) => ({ id: c.id, parent_id: c.parent_id, label: c.label })),
  );
  return <NotificacionesClient view={view} />;
}
