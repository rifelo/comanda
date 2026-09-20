import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getConteo } from "@/lib/inventario/conteos";
import { TurnosHeader } from "../../../_components/turnos-header";
import { ConteoDetail } from "./conteo-detail";

export const dynamic = "force-dynamic";

export default async function ConteoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { profile, supabase } = await requireAdmin();
  const conteo = await getConteo(supabase, profile.organization_id, id);
  if (!conteo) notFound();
  return (
    <div>
      <TurnosHeader kicker="OPERACIÓN · INVENTARIO · CONTEOS" title={conteo.kind === "diario" ? "Conteo diario" : "Conteo completo"}>
        <Link href="/inventario/conteos" className="cmd-btn ghost sm" style={{ textDecoration: "none" }}>← Conteos</Link>
      </TurnosHeader>
      <ConteoDetail conteo={conteo} />
    </div>
  );
}
