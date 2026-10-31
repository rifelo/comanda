import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getIngredientesView } from "@/lib/db/ingredients";
import { countPropuestasPendientes, listConteos } from "@/lib/inventario/conteos";
import { buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/top-bar";
import { ConteosClient } from "./conteos-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conteos · Comanda" };

export default async function ConteosPage() {
  const { profile, supabase } = await requireAdmin();
  const [conteos, propuestas, view] = await Promise.all([
    listConteos(supabase, profile.organization_id),
    countPropuestasPendientes(supabase, profile.organization_id),
    getIngredientesView(profile.organization_id),
  ]);
  return (
    <div>
      <PageHeader back="/inventario" title="Conteos del equipo" sub="Al aprobar un conteo, sus diferencias ajustan el inventario." actions={<Link href="/turno/conteo" className={buttonClass({ variant: "ghost", size: "sm" })}>Contar ahora</Link>} />
      <ConteosClient conteos={conteos} propuestas={propuestas} ingredientes={view.ingredientes} categorias={view.categorias} />
    </div>
  );
}
