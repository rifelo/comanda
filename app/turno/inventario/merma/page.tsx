import { loadTurnoGate } from "@/lib/turno/server";
import { formatTime, todayInTz } from "@/lib/utils";
import { nombrePaquete, piezaDe } from "@/lib/inventario/niveles";
import { inicioDia, listMermas } from "@/lib/inventario/mermas-db";
import { TurnoLogin } from "../../_components/turno-login";
import { TurnoUnpaired } from "../../unpaired";
import { MermaScreen } from "./merma-screen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Merma · co-manda" };

/**
 * "Registrar merma" on the shared tablet: something was lost without being
 * sold — a drink (its whole recipe comes out) or a loose ingredient — with
 * what happened and why. Today's mermas are listed below, without costs.
 */
export default async function MermaPage() {
  const gate = await loadTurnoGate();
  if (gate.kind === "unpaired") return <TurnoUnpaired next="/turno/inventario/merma" />;
  if (gate.kind === "needs_login") return <TurnoLogin sedeName={gate.sede.name} error={gate.error} />;
  const { ctx } = gate;
  const { admin, organizationId: orgId, sede } = ctx;
  const today = todayInTz(sede.tz);
  const [{ data: prods }, { data: receta }, { data: ings }, hoy] = await Promise.all([
    admin.from("productos").select("id, name").eq("organization_id", orgId).order("name"),
    admin.from("receta_items").select("producto_id").eq("organization_id", orgId),
    admin.from("ingredientes").select("id, name, unit, pack_qty, pack_label, pieza_qty").eq("organization_id", orgId).eq("archived", false).order("name"),
    listMermas(admin, orgId, inicioDia(today), 100),
  ]);
  // Only products with a recipe can take it out of the inventory.
  const conReceta = new Set((receta ?? []).map((r) => r.producto_id as string));
  return (
    <MermaScreen
      sedeName={sede.name}
      actorName={ctx.actor.fullName}
      productos={(prods ?? []).filter((p) => conReceta.has(p.id as string)).map((p) => ({ id: p.id as string, name: p.name as string }))}
      insumos={(ings ?? []).map((i) => {
        const pieza = piezaDe({ unit: i.unit as string, pack_qty: i.pack_qty === null ? null : Number(i.pack_qty), pieza_qty: i.pieza_qty === null ? null : Number(i.pieza_qty) });
        return { id: i.id as string, name: i.name as string, enQue: pieza ? nombrePaquete({ pack_label: i.pack_label as string | null }, 2) : (i.unit as string) };
      })}
      hoy={hoy.map((m) => ({ id: m.id, nombre: m.nombre, cantidad: `${String(m.qty).replace(".", ",")} ${m.kind === "producto" ? "und" : m.unidad}`, motivo: m.motivo, justificacion: m.justificacion, quien: m.reportedBy, hora: formatTime(new Date(m.reportedAt), sede.tz) }))}
    />
  );
}
