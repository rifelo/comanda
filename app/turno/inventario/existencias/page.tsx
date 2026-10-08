import { loadTurnoGate } from "@/lib/turno/server";
import { lastConteoAt } from "@/lib/inventario/conteos";
import { todayInTz } from "@/lib/utils";
import { TurnoLogin } from "../../_components/turno-login";
import { TurnoUnpaired } from "../../unpaired";
import { ExistenciasScreen, type ExistenciaItem } from "./existencias-screen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Existencias · co-manda" };

/**
 * What the shop has, for the team: every item with its level (hay / poco /
 * se acabó) and how much is left the way it is said at the bar. Read-only and
 * without costs — stock only changes through a count or a reception.
 */
export default async function ExistenciasPage() {
  const gate = await loadTurnoGate();
  if (gate.kind === "unpaired") return <TurnoUnpaired next="/turno/inventario/existencias" />;
  if (gate.kind === "needs_login") return <TurnoLogin sedeName={gate.sede.name} error={gate.error} />;
  const { ctx } = gate;
  const [{ data: ings }, { data: cats }, { count: base }, lastCount] = await Promise.all([
    ctx.admin
      .from("ingredientes")
      .select("id, name, unit, category_id, stock_current, stock_critico, stock_min, stock_objetivo, pack_qty, pack_label, pieza_qty, ubicacion")
      .eq("organization_id", ctx.organizationId)
      .eq("archived", false)
      .order("name"),
    ctx.admin.from("ingrediente_categorias").select("id, label, position").eq("organization_id", ctx.organizationId).order("position"),
    ctx.admin.from("inventario_conteos").select("id", { count: "exact", head: true }).eq("organization_id", ctx.organizationId).eq("kind", "completo").eq("status", "aprobado"),
    lastConteoAt(ctx.admin, ctx.organizationId, "diario"),
  ]);
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const items: ExistenciaItem[] = (ings ?? []).map((i) => ({
    id: i.id as string,
    name: i.name as string,
    unit: i.unit as string,
    category_id: (i.category_id as string | null) ?? null,
    ubicacion: (i.ubicacion as string | null) ?? null,
    stock: Number(i.stock_current),
    stock_critico: Number(i.stock_critico ?? 0),
    stock_min: Number(i.stock_min ?? 0),
    stock_objetivo: num(i.stock_objetivo),
    pack_qty: num(i.pack_qty),
    pack_label: (i.pack_label as string | null) ?? null,
    pieza_qty: num(i.pieza_qty),
  }));
  return (
    <ExistenciasScreen
      sedeName={ctx.sede.name}
      items={items}
      categorias={(cats ?? []).map((c) => ({ id: c.id as string, label: c.label as string }))}
      confiable={(base ?? 0) > 0}
      lastCountDay={lastCount ? todayInTz(ctx.sede.tz, new Date(lastCount)) : null}
    />
  );
}
