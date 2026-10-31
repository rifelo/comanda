import { ahoraMs, actorOf, requireEquipo } from "@/app/turno/_components/gate";
import { EquipoShell } from "@/app/turno/_components/equipo";
import { fechaCorta, todayInTz } from "@/lib/utils";
import { listCompras } from "@/lib/compras/compras-db";
import { nombrePaquete, piezaDe } from "@/lib/inventario/niveles";
import { RecibirScreen } from "./recibir-screen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pedidos por llegar · Comanda" };

/**
 * «Pedidos por llegar» on the shared tablet: the orders the owner placed and
 * that haven't arrived. Receiving one asks for the count of each product, a
 * photo of what came, a photo of the invoice, its total and how it was paid
 * (from the drawer → a cash out with its justification).
 */
export default async function RecibirPage() {
  const ctx = await requireEquipo("/turno/inventario/recibir");
  const today = todayInTz(ctx.sede.tz);
  const pedidos = await listCompras(ctx.admin, ctx.organizationId, ["pedido"]);
  return (
    <EquipoShell title="Pedidos por llegar" sub="Recibir lo que pidió el dueño" actor={actorOf(ctx)} tz={ctx.sede.tz} serverNow={ahoraMs()}>
    <RecibirScreen
      pedidos={pedidos
        .sort((a, b) => (a.entrega_esperada ?? "9").localeCompare(b.entrega_esperada ?? "9") || a.folio - b.folio)
        .map((c) => ({
          id: c.id,
          folio: c.folio,
          proveedor: c.proveedor_name ?? "Sin proveedor",
          pedido: fechaCorta(todayInTz(ctx.sede.tz, new Date(c.pedido_at))),
          llega: c.entrega_esperada ? (c.entrega_esperada === today ? "hoy" : fechaCorta(c.entrega_esperada)) : null,
          atrasado: !!c.entrega_esperada && c.entrega_esperada < today,
          nota: c.note,
          estimado: c.total_cop,
          lineas: c.items.map((it) => {
            const pieza = it.unit ? piezaDe({ unit: it.unit, pack_qty: it.pack_qty, pieza_qty: it.pieza_qty }) : null;
            return {
              id: it.id,
              nombre: it.nombre,
              // Typed in pieces when the item is counted in pieces.
              pedida: Math.round((it.qty_pedida / (pieza ?? 1)) * 100) / 100,
              enQue: it.unit ? (pieza ? nombrePaquete({ pack_label: it.pack_label }, 2) : it.unit) : "und",
              enInventario: !!it.ingrediente_id,
            };
          }),
        }))}
    />
    </EquipoShell>
  );
}
