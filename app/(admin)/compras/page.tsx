import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { agruparPorProveedor, mensajePedido, waLink } from "@/lib/compras/compras";
import { listCompras, loadPorPedir } from "@/lib/compras/compras-db";
import { cantidadLegible, nombrePaquete, piezaDe } from "@/lib/inventario/niveles";
import { todayIdxOf } from "@/lib/turno/state";
import { fechaCorta, todayInTz } from "@/lib/utils";
import { TurnosHeader } from "../_components/turnos-header";
import { ComprasClient, type GrupoView, type PedidoView } from "./compras-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Operación · Compras · co-manda" };

/**
 * Purchasing for the owner: what there is to order, by supplier (levels,
 * faltantes and what the team asked for from the tablet), with whoever is due
 * today first; one tap turns a supplier's lines into an order with the
 * WhatsApp message ready. Below, the orders on their way and each supplier's
 * order days.
 */
export default async function ComprasPage() {
  const [{ profile, supabase }, sede] = await Promise.all([requireAdmin(), getActiveSede()]);
  const tz = sede?.tz ?? "America/Bogota";
  const today = todayInTz(tz);
  const [data, pedidos] = await Promise.all([loadPorPedir(supabase, profile.organization_id), listCompras(supabase, profile.organization_id, ["pedido"])]);
  const itemById = new Map(data.items.map((i) => [i.id, i]));

  const grupos: GrupoView[] = agruparPorProveedor(data.lineas, data.proveedores, todayIdxOf(today)).map((g) => ({
    proveedor: g.proveedor ? { id: g.proveedor.id, name: g.proveedor.name, whatsapp: g.proveedor.whatsapp, dias: g.proveedor.dias_pedido_idx } : null,
    toca: g.toca,
    faltan: g.faltan,
    lineas: g.lineas.map((l) => {
      const it = l.ingredienteId ? itemById.get(l.ingredienteId) : undefined;
      const pieza = it ? piezaDe(it) : null;
      return {
        key: l.key,
        nombre: l.nombre,
        nivel: l.nivel,
        motivos: l.motivos,
        notas: l.notas,
        solicitudId: l.ingredienteId ? null : l.solicitudIds[0] ?? null,
        hay: it ? (it.stock < 0 ? "sin dato" : cantidadLegible(it.stock, it)) : null,
        qty: l.qty,
        // What the quantity is typed in: pieces when the item has one, else its unit.
        pieza,
        enQue: it ? (pieza ? nombrePaquete(it, 2) : it.unit) : "und",
      };
    }),
  }));

  const enCamino: PedidoView[] = pedidos.map((c) => {
    const lineas = c.items.map((it) => ({ nombre: it.nombre, cantidad: it.unit ? cantidadLegible(it.qty_pedida, { unit: it.unit, pack_qty: it.pack_qty, pieza_qty: it.pieza_qty, pack_label: it.pack_label }) : String(it.qty_pedida) }));
    return {
      id: c.id,
      folio: c.folio,
      proveedor: c.proveedor_name ?? "Sin proveedor",
      pedido: fechaCorta(todayInTz(tz, new Date(c.pedido_at))),
      llega: c.entrega_esperada ? fechaCorta(c.entrega_esperada) : null,
      atrasado: !!c.entrega_esperada && c.entrega_esperada < today,
      lineas,
      wa: waLink(c.proveedor_whatsapp, mensajePedido({ negocio: sede?.name ?? "la cafetería", folio: c.folio, lineas, nota: c.note })),
    };
  });

  return (
    <div>
      <TurnosHeader kicker="OPERACIÓN · INVENTARIO" title="Compras">
        <Link href="/inventario/niveles" className="cmd-btn ghost sm" style={{ textDecoration: "none" }}>Niveles y proveedores</Link>
      </TurnosHeader>
      <ComprasClient
        grupos={grupos}
        enCamino={enCamino}
        proveedores={data.proveedores.map((p) => ({ id: p.id, name: p.name, whatsapp: p.whatsapp, dias: p.dias_pedido_idx, entregaDias: p.entrega_dias }))}
      />
    </div>
  );
}
