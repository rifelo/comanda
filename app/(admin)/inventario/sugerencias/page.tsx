import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { TurnosHeader } from "../../_components/turnos-header";
import { SugerenciasClient, type SugerenciaView } from "./sugerencias-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Operación · Sugerencias del equipo · co-manda" };

/**
 * What the team suggested from the tablet, section by section: an item that
 * belongs in another section (apply moves it), or something missing from the
 * list (create it there, or join it to the item it really is). Keeps the
 * walked count in the order the shelves actually are.
 */
export default async function SugerenciasPage() {
  const { profile, supabase } = await requireAdmin();
  const orgId = profile.organization_id;
  const [{ data: rows }, { data: ings }, { data: cats }] = await Promise.all([
    supabase
      .from("inventario_sugerencias")
      .select("id, zona, tipo, nombre, presentacion, nota, status, created_at, ingrediente_id, ingrediente:ingredientes!inventario_sugerencias_ingrediente_id_fkey(name, ubicacion), resultado:ingredientes!inventario_sugerencias_resultado_ingrediente_id_fkey(name), quien:profiles!inventario_sugerencias_sugerido_por_fkey(full_name)")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(120),
    supabase.from("ingredientes").select("id, name, ubicacion").eq("organization_id", orgId).eq("archived", false).order("name"),
    supabase.from("ingrediente_categorias").select("id, label, parent_id").eq("organization_id", orgId).order("position"),
  ]);
  const one = <T,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as T | null;
  const views: SugerenciaView[] = (rows ?? []).map((r) => {
    const ing = one<{ name: string; ubicacion: string | null }>(r.ingrediente);
    return {
      id: r.id as string,
      zona: r.zona as string,
      tipo: r.tipo as SugerenciaView["tipo"],
      nombre: (r.nombre as string | null) ?? ing?.name ?? "—",
      ubicacionActual: ing?.ubicacion ?? null,
      presentacion: (r.presentacion as string | null) ?? null,
      nota: (r.nota as string | null) ?? null,
      status: r.status as SugerenciaView["status"],
      resultado: one<{ name: string }>(r.resultado)?.name ?? null,
      quien: one<{ full_name: string | null }>(r.quien)?.full_name ?? null,
      fecha: (r.created_at as string).slice(0, 10),
    };
  });
  return (
    <div>
      <TurnosHeader kicker="OPERACIÓN · INVENTARIO" title="Sugerencias del equipo">
        <Link href="/inventario" className="cmd-btn ghost sm" style={{ textDecoration: "none" }}>← Inventario</Link>
        <Link href="/turno/inventario/sugerir" className="cmd-btn sm" style={{ textDecoration: "none" }}>Sugerir →</Link>
      </TurnosHeader>
      <SugerenciasClient
        sugerencias={views}
        items={(ings ?? []).map((i) => ({ id: i.id as string, name: i.name as string, ubicacion: (i.ubicacion as string | null) ?? null }))}
        categorias={(cats ?? []).map((c) => ({ id: c.id as string, label: c.label as string }))}
      />
    </div>
  );
}
