import { requireAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import type { MetricasDia } from "@/lib/whatsapp/aprendizajes";
import { AprendizajesClient, type LeccionVista, type RevisionVista } from "./aprendizajes-client";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
export const metadata = { title: "Aprendizajes · WhatsApp · Comanda" };

/**
 * What the WhatsApp agent has learnt: lessons the nightly review proposed
 * (approve, edit or discard), the ones it follows now, and each night's
 * numbers so a change in the prompt can be judged by its results.
 */
export default async function AprendizajesPage() {
  const { profile, supabase } = await requireAdmin();
  const [{ data: lecc }, { data: revs }] = await Promise.all([
    supabase
      .from("agente_lecciones")
      .select("id, texto, motivo, ejemplo, estado, fecha_origen, created_at")
      .eq("organization_id", profile.organization_id)
      .in("estado", ["propuesta", "aprobada"])
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("agente_revisiones")
      .select("fecha, resumen, metricas")
      .eq("organization_id", profile.organization_id)
      .order("fecha", { ascending: false })
      .limit(14),
  ]);
  const lecciones = (lecc ?? []) as LeccionVista[];
  const revisiones = ((revs ?? []) as { fecha: string; resumen: string | null; metricas: MetricasDia }[]).map(
    (r): RevisionVista => ({ fecha: r.fecha, resumen: r.resumen, metricas: r.metricas }),
  );
  return (
    <div className="mx-auto w-full max-w-[900px]">
      <PageHeader title="Aprendizajes del agente" sub="Lo que el agente aprende de las conversaciones, con tu aprobación" back="/whatsapp" />
      <div className="px-4 sm:px-7 pb-12">
        <AprendizajesClient
          propuestas={lecciones.filter((l) => l.estado === "propuesta")}
          activas={lecciones.filter((l) => l.estado === "aprobada").reverse()}
          revisiones={revisiones}
        />
      </div>
    </div>
  );
}
