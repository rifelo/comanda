import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getConteo, listPropuestas } from "@/lib/inventario/conteos";
import { conteoPanel } from "@/lib/inventario/agente/db";
import { getIngredientesView } from "@/lib/db/ingredients";
import { PageHeader } from "@/components/ui/top-bar";
import { ConteoDetail } from "./conteo-detail";
import { VerificacionDetalle } from "./verificacion-detalle";
import { TONO, diaCorto, diaDe, estadoConteo, horaDe, nombreCorto } from "../_lib/formato";

export const dynamic = "force-dynamic";

export default async function ConteoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { profile, supabase } = await requireAdmin();
  const orgId = profile.organization_id;

  const panel = await conteoPanel(supabase, orgId, id);
  if (!panel) notFound();

  // The assistant's verifications: per-line review.
  if (panel.kind === "agente") {
    const est = estadoConteo(panel);
    const dia = diaCorto(diaDe(panel.submittedAt));
    return (
      <div>
        <PageHeader
          back="/inventario/conteos"
          title={
            <span className="inline-flex flex-wrap items-center" style={{ gap: 10 }}>
              Verificación de inventario
              <span style={{ display: "inline-flex", padding: "4px 10px", borderRadius: 999, fontSize: 13, fontWeight: 600, letterSpacing: 0, background: TONO[est.tono].bg, color: TONO[est.tono].fg }}>{est.label}</span>
            </span>
          }
          sub={`${dia.charAt(0).toUpperCase()}${dia.slice(1)} · ${horaDe(panel.submittedAt)}${panel.countedBy ? ` · contó ${nombreCorto(panel.countedBy)}` : ""}`}
        />
        <VerificacionDetalle conteo={panel} />
      </div>
    );
  }

  // Old end-of-shift / full counts: approve or reject the whole count.
  const [conteo, propuestas, view] = await Promise.all([
    getConteo(supabase, orgId, id),
    listPropuestas(supabase, orgId, id),
    getIngredientesView(orgId),
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
