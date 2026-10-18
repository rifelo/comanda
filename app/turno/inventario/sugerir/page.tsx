import { loadTurnoGate } from "@/lib/turno/server";
import { TurnoLogin } from "../../_components/turno-login";
import { TurnoUnpaired } from "../../unpaired";
import { SugerirScreen } from "./sugerir-screen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sugerir ítems · co-manda" };

/**
 * «Sugerir ítems» on the shared tablet: section by section, what the list
 * says is there, and two ways to fix it — an item that belongs here, or
 * something here the list doesn't have. The owner applies them from the
 * panel (Inventario → Sugerencias).
 */
export default async function SugerirPage() {
  const gate = await loadTurnoGate();
  if (gate.kind === "unpaired") return <TurnoUnpaired next="/turno/inventario/sugerir" />;
  if (gate.kind === "needs_login") return <TurnoLogin sedeName={gate.sede.name} error={gate.error} />;
  const { ctx } = gate;
  const [{ data: ings }, { data: abiertas }] = await Promise.all([
    ctx.admin.from("ingredientes").select("id, name, ubicacion").eq("organization_id", ctx.organizationId).eq("archived", false).order("name"),
    ctx.admin
      .from("inventario_sugerencias")
      .select("id, zona, tipo, nombre, presentacion, nota, ingrediente:ingredientes!inventario_sugerencias_ingrediente_id_fkey(name, ubicacion), quien:profiles!inventario_sugerencias_sugerido_por_fkey(full_name)")
      .eq("organization_id", ctx.organizationId)
      .eq("status", "pendiente")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  const one = <T,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as T | null;
  return (
    <SugerirScreen
      sedeName={ctx.sede.name}
      actorName={ctx.actor.fullName}
      items={(ings ?? []).map((i) => ({ id: i.id as string, name: i.name as string, ubicacion: (i.ubicacion as string | null) ?? null }))}
      abiertas={(abiertas ?? []).map((s) => {
        const ing = one<{ name: string; ubicacion: string | null }>(s.ingrediente);
        return {
          id: s.id as string,
          zona: s.zona as string,
          texto: s.tipo === "ubicacion" ? `${ing?.name ?? "—"} va aquí${ing?.ubicacion ? ` (hoy: ${ing.ubicacion})` : ""}` : `Falta en la lista: ${s.nombre as string}${s.presentacion ? ` · ${s.presentacion as string}` : ""}`,
          nota: (s.nota as string | null) ?? null,
          quien: one<{ full_name: string | null }>(s.quien)?.full_name ?? null,
        };
      })}
    />
  );
}
