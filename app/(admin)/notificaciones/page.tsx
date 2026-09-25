import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { getIngredientesView } from "@/lib/db/ingredients";
import { listFaltantesAbiertos } from "@/lib/inventario/faltantes-db";
import { buildAlertas } from "@/lib/notificaciones";
import { FaltantesCard } from "@/components/inventario/faltantes-card";
import { NotificacionesClient } from "./notificaciones-client";

export const metadata = { title: "Operación · Notificaciones · co-manda" };
export const dynamic = "force-dynamic";

export default async function NotificacionesPage() {
  const [{ profile, supabase }, sede] = await Promise.all([requireAdmin(), getActiveSede()]);
  const [{ ingredientes, categorias }, faltantes] = await Promise.all([
    getIngredientesView(profile.organization_id),
    listFaltantesAbiertos(supabase, profile.organization_id),
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
  // What the team flagged from the tablet goes first: it is the freshest signal.
  // (Keys: JSX crossing into a client component's props is serialised as an
  // array of children, and React warns without them.)
  const reportados = (
    <section style={{ marginBottom: 22 }}>
      <div key="head" className="flex items-center justify-between" style={{ marginBottom: 8 }}>
        <span className="text-muted" style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase" }}>
          Reportado por el equipo · {faltantes.length}
        </span>
        <Link href="/inventario/faltantes" className="cmd-link" style={{ fontSize: 11 }}>Lista prioritaria e historial →</Link>
      </div>
      <FaltantesCard key="card" items={faltantes} tz={sede?.tz ?? "America/Bogota"} showLink={false} />
    </section>
  );
  return <NotificacionesClient view={view} reportados={reportados} />;
}
