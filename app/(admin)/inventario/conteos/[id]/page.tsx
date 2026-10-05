import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getConteo, listPropuestas } from "@/lib/inventario/conteos";
import { getIngredientesView } from "@/lib/db/ingredients";
import { TurnosHeader } from "../../../_components/turnos-header";
import { ConteoDetail } from "./conteo-detail";

export const dynamic = "force-dynamic";

export default async function ConteoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { profile, supabase } = await requireAdmin();
  const [conteo, propuestas, view] = await Promise.all([
    getConteo(supabase, profile.organization_id, id),
    listPropuestas(supabase, profile.organization_id, id),
    getIngredientesView(profile.organization_id),
  ]);
  if (!conteo) notFound();
  return (
    <div>
      <TurnosHeader kicker="OPERACIÓN · INVENTARIO · CONTEOS" title={conteo.kind === "diario" ? "Conteo rápido" : "Conteo completo"}>
        <Link href="/inventario/conteos" className="cmd-btn ghost sm" style={{ textDecoration: "none" }}>← Conteos</Link>
      </TurnosHeader>
      <ConteoDetail
        conteo={conteo}
        propuestas={propuestas}
        ingredientes={view.ingredientes.map((i) => ({ id: i.id, name: i.name, unit: i.unit }))}
        categorias={view.categorias.map((c) => ({ id: c.id, label: c.label }))}
      />
    </div>
  );
}
