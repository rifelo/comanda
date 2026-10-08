import { loadTurnoGate } from "@/lib/turno/server";
import { loadPorPedir } from "@/lib/compras/compras-db";
import { cantidadLegible, nombrePaquete, piezaDe } from "@/lib/inventario/niveles";
import { TurnoLogin } from "../../_components/turno-login";
import { TurnoUnpaired } from "../../unpaired";
import { PedirScreen } from "./pedir-screen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pedir · co-manda" };

/**
 * The requisition on the shared tablet: what is already on the shopping list
 * (levels, faltantes and what the team asked for) and a short form to ask for
 * something else. The owner turns the list into orders from the panel.
 */
export default async function PedirPage() {
  const gate = await loadTurnoGate();
  if (gate.kind === "unpaired") return <TurnoUnpaired next="/turno/inventario/pedir" />;
  if (gate.kind === "needs_login") return <TurnoLogin sedeName={gate.sede.name} error={gate.error} />;
  const { ctx } = gate;
  const data = await loadPorPedir(ctx.admin, ctx.organizationId);
  const prov = new Map(data.proveedores.map((p) => [p.id, p.name]));
  const byId = new Map(data.items.map((i) => [i.id, i]));
  return (
    <PedirScreen
      sedeName={ctx.sede.name}
      lineas={data.lineas.filter((l) => l.ingredienteId).map((l) => ({ key: l.key, nombre: l.nombre, nivel: l.nivel, legible: l.legible, motivos: l.motivos, proveedor: l.proveedorId ? prov.get(l.proveedorId) ?? null : null }))}
      items={data.items.map((i) => {
        const pieza = piezaDe(i);
        return { id: i.id, name: i.name, enQue: pieza ? nombrePaquete(i, 2) : i.unit };
      })}
      solicitudes={data.solicitudes.map((s) => {
        const it = s.ingrediente_id ? byId.get(s.ingrediente_id) : undefined;
        return { id: s.id, nombre: s.ingrediente_name ?? s.nombre ?? "—", cantidad: s.qty === null ? null : it ? cantidadLegible(s.qty, it) : String(s.qty), note: s.note, quien: s.requested_by_name };
      })}
    />
  );
}
