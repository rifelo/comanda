import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { getIngredientesView } from "@/lib/db/ingredients";
import { loadConteosPanel } from "@/lib/inventario/conteos";
import { listFaltantesAbiertos } from "@/lib/inventario/faltantes-db";
import { buildAlertas } from "@/lib/notificaciones";
import { NotificacionesClient } from "./notificaciones-client";

export const metadata = { title: "Alertas de stock · Comanda" };
export const dynamic = "force-dynamic";

export default async function NotificacionesPage() {
  const [{ profile, supabase }, sede] = await Promise.all([requireAdmin(), getActiveSede()]);
  const tz = sede?.tz ?? "America/Bogota";
  const [{ ingredientes, categorias }, faltantes, conteos] = await Promise.all([
    getIngredientesView(profile.organization_id),
    listFaltantesAbiertos(supabase, profile.organization_id),
    loadConteosPanel(supabase, profile.organization_id, tz),
  ]);
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
  // What the team flagged from the tablet goes first: it is the freshest
  // signal. Passed as data (not server JSX) so the client renders the cards
  // itself — server-built element trees in props tripped React's key warning.
  return <NotificacionesClient view={view} reportados={{ conteos, faltantes, tz }} />;
}
