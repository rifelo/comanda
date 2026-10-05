import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getIngredientesView } from "@/lib/db/ingredients";
import { countPropuestasPendientes, listConteos } from "@/lib/inventario/conteos";
import { TurnosHeader } from "../../_components/turnos-header";
import { ConteosClient } from "./conteos-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Operación · Conteos · co-manda" };

export default async function ConteosPage() {
  const { profile, supabase } = await requireAdmin();
  const [conteos, propuestas, view] = await Promise.all([
    listConteos(supabase, profile.organization_id),
    countPropuestasPendientes(supabase, profile.organization_id),
    getIngredientesView(profile.organization_id),
  ]);
  return (
    <div>
      <TurnosHeader kicker="OPERACIÓN · INVENTARIO" title="Conteos del equipo">
        <Link href="/inventario" className="cmd-btn ghost sm" style={{ textDecoration: "none" }}>← Inventario</Link>
        <Link href="/turno/conteo" className="cmd-btn sm" style={{ textDecoration: "none" }}>Contar ahora →</Link>
      </TurnosHeader>
      <ConteosClient conteos={conteos} propuestas={propuestas} ingredientes={view.ingredientes} categorias={view.categorias} />
    </div>
  );
}
