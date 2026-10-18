/**
 * Receiving an order on the tablet: what the team counted against what was
 * ordered, the two photos, the invoice total and how it was paid. Pure
 * helpers — no I/O; unit-tested in recepcion.test.ts. The writes live in
 * app/turno/inventario/recibir/actions.ts.
 */

export const PAGOS_RECEPCION = ["efectivo_caja", "transferencia", "pendiente"] as const;
export type PagoRecepcion = (typeof PAGOS_RECEPCION)[number];

export const PAGO_RECEPCION: Record<PagoRecepcion, { label: string; hint: string }> = {
  efectivo_caja: { label: "Efectivo de la caja", hint: "Se pagó con plata del cajón: queda una salida de caja" },
  transferencia: { label: "Transferencia", hint: "Lo pagó el dueño por transferencia: la caja no cambia" },
  pendiente: { label: "Queda debiendo", hint: "Todavía no se ha pagado" },
};

/** Why the reception can't be sent yet, or null when it can. */
export function errorRecepcion(input: {
  lineas: ReadonlyArray<{ recibida: number | null }>;
  fotoRecibido: string | null;
  fotoFactura: string | null;
  facturaTotal: number | null;
  pago: string | null;
}): string | null {
  if (input.lineas.some((l) => l.recibida === null || l.recibida < 0)) return "Cuenta cada producto: escribe cuánto llegó (0 si no llegó).";
  if (input.lineas.every((l) => l.recibida === 0)) return "No llegó nada: si el pedido no vino, no lo recibas.";
  if (!input.fotoRecibido) return "Falta la foto de lo que llegó.";
  if (!input.fotoFactura) return "Falta la foto de la factura.";
  if (input.facturaTotal === null || !Number.isInteger(input.facturaTotal) || input.facturaTotal <= 0) return "Escribe el total de la factura.";
  if (!input.pago || !(PAGOS_RECEPCION as readonly string[]).includes(input.pago)) return "Elige cómo se pagó.";
  return null;
}

/** Lines where what arrived differs from what was ordered (stock units). */
export function diferencias<T extends { pedida: number; recibida: number }>(lineas: ReadonlyArray<T>): (T & { diff: number })[] {
  return lineas.map((l) => ({ ...l, diff: Math.round((l.recibida - l.pedida) * 1000) / 1000 })).filter((l) => l.diff !== 0);
}

/** The justification of the cash out when the order is paid from the drawer. */
export function justificacionPago(input: { folio: number; proveedor: string | null; nota?: string | null }): string {
  const base = `Pago del pedido n.º ${input.folio}${input.proveedor ? ` a ${input.proveedor}` : ""} al recibirlo (factura con foto)`;
  return (input.nota?.trim() ? `${base} · ${input.nota.trim()}` : base).slice(0, 300);
}
