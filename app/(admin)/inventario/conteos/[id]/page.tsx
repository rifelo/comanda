import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getConteo, listPropuestas } from "@/lib/inventario/conteos";
import { getIngredientesView } from "@/lib/db/ingredients";
import { PageHeader } from "@/components/ui/top-bar";
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
      <PageHeader back="/inventario/conteos" title={conteo.kind === "diario" ? "Conteo rápido" : "Conteo completo"} sub={conteo.counted_by_name ? `Contó ${conteo.counted_by_name}` : undefined} />
      <ConteoDetail
        conteo={conteo}
        propuestas={propuestas}
        ingredientes={view.ingredientes.map((i) => ({ id: i.id, name: i.name, unit: i.unit }))}
        categorias={view.categorias.map((c) => ({ id: c.id, label: c.label }))}
      />
    </div>
  );
}
