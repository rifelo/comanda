import { loadTurnoGate } from "@/lib/turno/server";
import { todayInTz } from "@/lib/utils";
import { lastConteoAt, listConteos } from "@/lib/inventario/conteos";
import type { InventarioConteo } from "@/lib/types";
import { TurnoLogin } from "../_components/turno-login";
import { TurnoUnpaired } from "../unpaired";
import { ConteoScreen, type ConteoIngrediente } from "./conteo-screen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conteo de inventario · co-manda" };

/**
 * End-of-shift stock count on the shared tablet, signed by whoever is logged
 * in. Blind: the person types what is on the shelf without seeing what the
 * system expects; the comparison shows once the count is sent, and the owner
 * approves it from the panel.
 */
export default async function ConteoPage() {
  const gate = await loadTurnoGate();
  if (gate.kind === "unpaired") return <TurnoUnpaired next="/turno/conteo" />;
  if (gate.kind === "needs_login") return <TurnoLogin sedeName={gate.sede.name} error={gate.error} />;
  const { ctx } = gate;
  const { admin, organizationId } = ctx;
  const [{ data: ings }, { data: cats }, lastCompleto, recent] = await Promise.all([
    admin
      .from("ingredientes")
      .select("id, name, unit, category_id, conteo_diario, archived")
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
  return (
    <ConteoScreen
      actor={{ name: ctx.actor.fullName, isAdmin: ctx.actor.role === "admin" && !ctx.actor.viaDevice }}
      sedeName={ctx.sede.name}
      today={today}
      ingredientes={(ings ?? []) as ConteoIngrediente[]}
      categorias={(cats ?? []).map((c) => ({ id: c.id as string, label: c.label as string }))}
      lastCompletoAt={lastCompleto}
      todayKinds={todayKinds}
    />
  );
}
