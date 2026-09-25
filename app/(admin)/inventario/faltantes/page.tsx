import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { getIngredientesView } from "@/lib/db/ingredients";
import { listFaltantesAbiertos, listFaltantesRecientes } from "@/lib/inventario/faltantes-db";
import { TurnosHeader } from "../../_components/turnos-header";
import { FaltantesClient } from "./faltantes-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Operación · Faltantes · co-manda" };

/**
 * Faltantes for the owner: what the team flagged from the tablet (with
 * "Repuesto" to close each one), the recent log, and the priority list the
 * quick inventory shows — each ingredient with its level (crítico /
 * importante / normal / fuera de la lista).
 */
export default async function FaltantesPage() {
  const [{ profile, supabase }, sede] = await Promise.all([requireAdmin(), getActiveSede()]);
  const [abiertos, recientes, view] = await Promise.all([
    listFaltantesAbiertos(supabase, profile.organization_id),
    listFaltantesRecientes(supabase, profile.organization_id, 40),
    getIngredientesView(profile.organization_id),
  ]);
  return (
    <div>
      <TurnosHeader kicker="OPERACIÓN · INVENTARIO" title="Faltantes del equipo">
        <Link href="/inventario" className="cmd-btn ghost sm" style={{ textDecoration: "none" }}>← Inventario</Link>
        <Link href="/turno/inventario" className="cmd-btn sm" style={{ textDecoration: "none" }}>Revisar ahora →</Link>
      </TurnosHeader>
      <FaltantesClient abiertos={abiertos} recientes={recientes} ingredientes={view.ingredientes} categorias={view.categorias} tz={sede?.tz ?? "America/Bogota"} />
    </div>
  );
}
