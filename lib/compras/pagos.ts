import { z } from "zod";

/**
 * Payments of a supplier order (compra_pagos, mig 0069). The owner records
 * what they paid outside the drawer (online with a card, PSE, transfer,
 * Nequi, their own cash); the tablet records the drawer's cash when it pays
 * on reception. What the order still owes = its total − the payments.
 *
 * Pure: shared by the server actions, the screens and the tests.
 */

export const MEDIOS_PAGO = ["tarjeta", "pse", "transferencia", "nequi", "efectivo", "otro", "efectivo_caja"] as const;
export type MedioPago = (typeof MEDIOS_PAGO)[number];
/** What the owner can pick: the drawer's cash only goes out from the tablet (it has to show in the arqueo). */
export const MEDIOS_DUENO = ["tarjeta", "pse", "transferencia", "nequi", "efectivo", "otro"] as const satisfies readonly MedioPago[];

export const MEDIO_PAGO: Record<MedioPago, string> = {
  tarjeta: "Tarjeta",
  pse: "PSE",
  transferencia: "Transferencia",
  nequi: "Nequi / Daviplata",
  efectivo: "Efectivo propio",
  otro: "Otro",
  efectivo_caja: "Efectivo de la caja",
};

export interface PagoCompra {
  id: string;
  fecha: string;
  monto: number;
  medio: MedioPago;
  referencia: string | null;
  note: string | null;
}

export const PagoCompraSchema = z.object({
  compraId: z.string().uuid(),
  /** YYYY-MM-DD the money went out. */
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  monto: z.number().int().positive().max(100_000_000),
  medio: z.enum(MEDIOS_DUENO),
  referencia: z.string().trim().max(80).optional(),
  note: z.string().trim().max(300).optional(),
});
export type PagoCompraInput = z.infer<typeof PagoCompraSchema>;

/** The amount the order is worth: the invoice once received, else the owner's estimate. */
export function totalCompra(c: { factura_total_cop: number | null; total_cop: number | null }): number | null {
  const t = c.factura_total_cop ?? c.total_cop;
  return t !== null && t > 0 ? Math.round(t) : null;
}

export type EstadoPago = "sin_pagos" | "parcial" | "pagado" | "de_mas";

export interface ResumenPago {
  pagado: number;
  total: number | null;
  /** What is still owed; null when the order has no total yet. */
  debe: number | null;
  estado: EstadoPago;
  /** «Pagado $75.226 · Tarjeta» / «Debe $20.000 de $56.000» … */
  texto: string;
}

const money = (n: number) => "$" + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");

export function resumenPago(total: number | null, pagos: ReadonlyArray<Pick<PagoCompra, "monto" | "medio">>): ResumenPago {
  const pagado = pagos.reduce((a, p) => a + p.monto, 0);
  const medios = [...new Set(pagos.map((p) => MEDIO_PAGO[p.medio]))].join(" + ");
  if (total === null) {
    return pagado > 0
      ? { pagado, total, debe: null, estado: "parcial", texto: `Pagado ${money(pagado)} · ${medios} · sin total` }
      : { pagado, total, debe: null, estado: "sin_pagos", texto: "Sin pagos registrados" };
  }
  const debe = total - pagado;
  if (pagado === 0) return { pagado, total, debe, estado: "sin_pagos", texto: `Debe ${money(total)}` };
  if (debe > 0) return { pagado, total, debe, estado: "parcial", texto: `Pagado ${money(pagado)} · ${medios} · debe ${money(debe)}` };
  if (debe < 0) return { pagado, total, debe: 0, estado: "de_mas", texto: `Pagado ${money(pagado)} · ${medios} · ${money(-debe)} más que el total` };
  return { pagado, total, debe: 0, estado: "pagado", texto: `Pagado ${money(pagado)} · ${medios}` };
}
