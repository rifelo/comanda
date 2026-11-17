import { ahoraMs, actorOf, requireEquipo } from "@/app/turno/_components/gate";
import { EquipoShell } from "@/app/turno/_components/equipo";
import { fechaCorta, todayInTz } from "@/lib/utils";
import { listCompras, type Compra } from "@/lib/compras/compras-db";
import { MEDIO_PAGO } from "@/lib/compras/pagos";
import { PAGO_RECEPCION } from "@/lib/compras/recepcion";
import { nombrePaquete, piezaDe } from "@/lib/inventario/niveles";
import { PedidosScreen, type PedidoRecibido } from "./pedidos-screen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pedidos · Comanda" };

/** Stock units → what the line is counted in (pieces when it has them). */
function enPiezas(it: Compra["items"][number]) {
  const pieza = it.unit ? piezaDe({ unit: it.unit, pack_qty: it.pack_qty, pieza_qty: it.pieza_qty }) : null;
  const r = (n: number) => Math.round((n / (pieza ?? 1)) * 100) / 100;
  return {
    pedida: r(it.qty_pedida),
    recibida: it.qty_recibida === null ? null : r(it.qty_recibida),
    enQue: it.unit ? (pieza ? nombrePaquete({ pack_label: it.pack_label }, 2) : it.unit) : "und",
  };
}

/**
 * «Pedidos» on the shared tablet: the orders the owner confirmed and that
 * haven't arrived («Por llegar»), received with a checklist of what was
 * ordered against what came, plus the photos, the invoice and the payment;
 * and the orders received in the last two weeks («Recibidos») with that same
 * comparison, to check later what came short.
 */
export default async function PedidosPage() {
  const ctx = await requireEquipo("/turno/pedidos");
  const tz = ctx.sede.tz;
  const today = todayInTz(tz);
  const [pedidos, recibidosAll] = await Promise.all([
    listCompras(ctx.admin, ctx.organizationId, ["pedido"]),
    listCompras(ctx.admin, ctx.organizationId, ["recibido", "cerrada"], 20),
  ]);
  const hace14 = new Date(Date.parse(`${today}T12:00:00Z`) - 14 * 86_400_000).toISOString();
  const recibidos: PedidoRecibido[] = recibidosAll
    .filter((c) => c.recibido_at && c.recibido_at >= hace14)
    .map((c) => ({
      id: c.id,
      folio: c.folio,
      proveedor: c.proveedor_name ?? "Sin proveedor",
      recibido: fechaCorta(todayInTz(tz, new Date(c.recibido_at!))),
      recibidoPor: c.recibido_by_name,
      factura: c.factura_total_cop,
      pago: c.pago_metodo ? (c.pago_metodo === "dueno" ? PAGO_RECEPCION.dueno.label : c.pago_metodo === "pendiente" ? PAGO_RECEPCION.pendiente.label : MEDIO_PAGO[c.pago_metodo]) : null,
      nota: c.recibido_nota,
      lineas: c.items.map((it) => ({ id: it.id, nombre: it.nombre, ...enPiezas(it) })),
    }));

  return (
    <EquipoShell title="Pedidos" sub="Por llegar y recibidos" actor={actorOf(ctx)} tz={tz} serverNow={ahoraMs()}>
      <PedidosScreen
        recibidos={recibidos}
        pedidos={pedidos
          .sort((a, b) => (a.entrega_esperada ?? "9").localeCompare(b.entrega_esperada ?? "9") || a.folio - b.folio)
          .map((c) => ({
            id: c.id,
            folio: c.folio,
            proveedor: c.proveedor_name ?? "Sin proveedor",
            pedido: fechaCorta(todayInTz(tz, new Date(c.pedido_at))),
            llega: c.entrega_esperada ? (c.entrega_esperada === today ? "hoy" : fechaCorta(c.entrega_esperada)) : null,
            atrasado: !!c.entrega_esperada && c.entrega_esperada < today,
            nota: c.note,
            estimado: c.total_cop,
            yaPagado: c.pagos.reduce((a, pg) => a + pg.monto, 0),
            pagarDeCaja: c.pago_previsto === "caja",
            pagadoCon: c.pagos.length ? [...new Set(c.pagos.map((pg) => MEDIO_PAGO[pg.medio]))].join(" + ") : null,
            lineas: c.items.map((it) => {
              const e = enPiezas(it);
              return { id: it.id, nombre: it.nombre, pedida: e.pedida, enQue: e.enQue, enInventario: !!it.ingrediente_id };
            }),
          }))}
      />
    </EquipoShell>
  );
}
