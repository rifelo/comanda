import { resumenPago, totalCompra } from "./pagos";
import type { MedioPago } from "./pagos";

/**
 * Proveedores tab: what each supplier means to the business at a glance —
 * how many orders, what was bought lately and what is still owed. Pure, so
 * the list and the supplier's own page agree on the same numbers.
 */

export interface CompraResumible {
  status: "pedido" | "recibido" | "cerrada" | "cancelada";
  pedido_at: string;
  total_cop: number | null;
  factura_total_cop: number | null;
  pagos: ReadonlyArray<{ monto: number; medio: MedioPago }>;
}

export interface ResumenProveedor {
  /** Orders that were not cancelled. */
  pedidos: number;
  /** ISO of the latest non-cancelled order, or null. */
  ultimoPedido: string | null;
  /** Orders still on their way (status «pedido»). */
  enCamino: number;
  /** Value of the orders placed since `desde` (invoice once received, else the estimate). */
  comprado: number;
  /** Still owed on received orders: invoice − payments, never below 0. */
  debe: number;
  /** Received orders with no total yet, so what they owe is unknown. */
  sinTotal: number;
}

/** Summarise a supplier's orders; `desde` is the ISO instant the «comprado» window starts. */
export function resumenProveedor(compras: ReadonlyArray<CompraResumible>, desde: string): ResumenProveedor {
  const vivas = compras.filter((c) => c.status !== "cancelada");
  const r: ResumenProveedor = { pedidos: vivas.length, ultimoPedido: null, enCamino: 0, comprado: 0, debe: 0, sinTotal: 0 };
  for (const c of vivas) {
    if (!r.ultimoPedido || c.pedido_at > r.ultimoPedido) r.ultimoPedido = c.pedido_at;
    if (c.status === "pedido") r.enCamino++;
    const total = totalCompra(c);
    if (c.pedido_at >= desde && total) r.comprado += total;
    // Only what arrived is owed: an order still on its way can't be a debt yet.
    if (c.status === "pedido") continue;
    const p = resumenPago(total, c.pagos);
    if (p.debe === null) r.sinTotal++;
    else r.debe += Math.max(0, p.debe);
  }
  return r;
}

/** Digits only, with Colombia's country code when a bare mobile number was typed. */
export function normalizarWhatsapp(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  if (!d) return null;
  return d.length === 10 && d.startsWith("3") ? `57${d}` : d;
}

/** «+57 300 123 4567» for a Colombian mobile, «+<digits>» otherwise. */
export function whatsappLegible(d: string | null): string | null {
  if (!d) return null;
  const m = d.match(/^57(3\d{2})(\d{3})(\d{4})$/);
  return m ? `+57 ${m[1]} ${m[2]} ${m[3]}` : `+${d}`;
}
