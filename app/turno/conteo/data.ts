import "server-only";
import { todayInTz } from "@/lib/utils";
import { lastConteoAt, listConteos } from "@/lib/inventario/conteos";
import type { TurnoContext } from "@/lib/turno/server";
import type { InventarioConteo } from "@/lib/types";
import type { ConteoIngrediente } from "./conteo-screen";

/** Everything ConteoScreen needs (/turno/conteo and the «Conteo rápido» step of /turno/cerrar). */
export async function loadConteoProps(ctx: TurnoContext) {
  const { admin, organizationId } = ctx;
  const [{ data: ings }, { data: cats }, lastCompleto, recent] = await Promise.all([
    admin
      .from("ingredientes")
      .select("id, name, unit, category_id, conteo_diario, archived, pack_qty, pack_label, pieza_qty, stock_critico, stock_min, stock_objetivo, ubicacion")
      .eq("organization_id", organizationId)
      .eq("archived", false)
      .order("name"),
    admin.from("ingrediente_categorias").select("id, label, position").eq("organization_id", organizationId).order("position"),
    lastConteoAt(admin, organizationId, "completo"),
    listConteos(admin, organizationId, 5),
  ]);
  const today = todayInTz(ctx.sede.tz);
  const todayKinds = (recent as InventarioConteo[])
    .filter((c) => todayInTz(ctx.sede.tz, new Date(c.submitted_at)) === today && c.status !== "rechazado")
    .map((c) => c.kind);
  return {
    actor: { name: ctx.actor.fullName, isAdmin: ctx.actor.role === "admin" && !ctx.actor.viaDevice },
    sedeName: ctx.sede.name,
    today,
    ingredientes: (ings ?? []) as ConteoIngrediente[],
    categorias: (cats ?? []).map((c) => ({ id: c.id as string, label: c.label as string })),
    lastCompletoAt: lastCompleto,
    todayKinds,
  };
}
