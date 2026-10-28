/**
 * Cash that enters or leaves the drawer without being a sale: the change
 * float someone brings to operate, the delivery rider paid at the door, a
 * supplier paid when the order arrives, the cash taken to the bank. Pure
 * helpers — reasons, validation, totals, the keypad. No I/O; unit-tested in
 * movimientos.test.ts. The writes live in lib/caja/movimientos-db.ts.
 */

import type { CajaDenominacion } from "@/lib/types";
import { totalContado } from "./arqueo";

export type TipoMovimiento = "ingreso" | "salida";
export const MOTIVOS_CAJA = ["sencillo", "aporte", "devolucion", "pago_pedido", "domicilio", "consignacion", "compra_menor", "retiro", "otro"] as const;
export type MotivoCaja = (typeof MOTIVOS_CAJA)[number];

/** What the photo means for a reason: required to save, «por confirmar» until it is taken, or optional. */
export type FotoRegla = "obligatoria" | "confirma" | "opcional";

export const MOTIVO_CAJA: Record<MotivoCaja, { label: string; tipo: TipoMovimiento | "ambos"; hint: string; foto: FotoRegla; fotoLabel: string; frases: string[] }> = {
  sencillo: { label: "Adición de sencillo", tipo: "ingreso", hint: "Billetes y monedas para dar cambio; se cuentan por pieza.", foto: "opcional", fotoLabel: "Foto", frases: ["Sencillo que trajo el dueño", "Cambié un billete en el banco", "Cambio en la tienda"] },
  aporte: { label: "Aporte del dueño", tipo: "ingreso", hint: "Plata que se agrega a la caja para operar.", foto: "opcional", fotoLabel: "Foto", frases: ["El dueño trajo plata para operar", "Para completar la base"] },
  devolucion: { label: "Devolución", tipo: "ingreso", hint: "Sobró plata de algo que se pagó con la caja.", foto: "opcional", fotoLabel: "Foto del recibo", frases: ["Sobró de una compra", "Devolvieron el vuelto de un domicilio"] },
  pago_pedido: { label: "Pago a proveedor", tipo: "salida", hint: "Eliges el pedido que llegó. Foto de la factura obligatoria.", foto: "obligatoria", fotoLabel: "Foto de la factura", frases: ["Llegó la leche", "Llegó el café", "Pedido de la semana", "Pago parcial, queda saldo", "Factura con descuento"] },
  domicilio: { label: "Pago de domicilio", tipo: "salida", hint: "Al domiciliario. Opcional: plataforma o número de orden.", foto: "opcional", fotoLabel: "Foto", frases: ["Domicilio a un cliente", "Pedido por WhatsApp", "Domicilio de un pedido grande"] },
  consignacion: { label: "Llevar a consignar", tipo: "salida", hint: "Quién la lleva. Queda por confirmar hasta subir la foto del comprobante.", foto: "confirma", fotoLabel: "Foto del comprobante", frases: ["Consignación del día", "Había mucho efectivo en la caja", "Pago de un servicio en el banco"] },
  compra_menor: { label: "Compra menor", tipo: "salida", hint: "Hielo, servilletas, un limón… Foto del recibo opcional.", foto: "opcional", fotoLabel: "Foto del recibo", frases: ["Bolsa de hielo", "Servilletas, se acabaron", "Limones", "Leche de emergencia"] },
  retiro: { label: "Retiro del dueño", tipo: "salida", hint: "Plata que se lleva el dueño de la caja.", foto: "opcional", fotoLabel: "Foto", frases: ["Se lo llevó el dueño", "Para pagar algo por fuera"] },
  otro: { label: "Otro", tipo: "ambos", hint: "Cuando no encaja en nada de lo de arriba. Explica bien el ¿por qué?.", foto: "opcional", fotoLabel: "Foto", frases: [] },
};

/** Reasons offered for an ingreso or a salida, in the order the tablet shows them. */
const ORDEN: Record<TipoMovimiento, MotivoCaja[]> = {
  ingreso: ["sencillo", "aporte", "devolucion", "otro"],
  salida: ["domicilio", "pago_pedido", "consignacion", "compra_menor", "retiro", "otro"],
};
export function motivosDe(tipo: TipoMovimiento): MotivoCaja[] {
  return ORDEN[tipo];
}

export const PLATAFORMAS_DOMICILIO = ["Rappi", "Didi Food", "Domiciliario propio"] as const;

/** What each reason adds to a movement (caja_movimientos.detalle). */
export interface DetalleMovimiento {
  /** Domicilio: platform and order number, both optional. */
  plataforma?: string;
  orden?: string;
  /** Consignación: who takes the cash to the bank. */
  quien?: string;
  /** Sencillo: the pieces that came in. */
  denominaciones?: CajaDenominacion[];
}

export const JUSTIFICACION_CAJA_MIN = 5;
export const MONTO_CAJA_MAX = 20_000_000;

/** Why a movement can't be saved yet, or null when it can. */
export function errorMovimiento(input: {
  tipo: string | null;
  monto: number | null;
  motivo: string | null;
  justificacion: string;
  detalle?: DetalleMovimiento;
  /** A photo is attached (or queued with the movement). */
  foto?: boolean;
  /** The linked order already carries its invoice photo (taken when it was received). */
  compraConFactura?: boolean;
}): string | null {
  if (input.tipo !== "ingreso" && input.tipo !== "salida") return "Elige si entra o sale plata.";
  if (input.monto === null || !Number.isInteger(input.monto) || input.monto <= 0) return "Escribe el monto en pesos.";
  if (input.monto > MONTO_CAJA_MAX) return "Ese monto es demasiado grande; revisa los ceros.";
  if (!input.motivo || !(MOTIVOS_CAJA as readonly string[]).includes(input.motivo)) return "Elige el motivo.";
  const motivo = input.motivo as MotivoCaja;
  const t = MOTIVO_CAJA[motivo].tipo;
  if (t !== "ambos" && t !== input.tipo) return "Ese motivo no corresponde.";
  if (motivo === "sencillo" && input.detalle?.denominaciones?.length && totalContado(input.detalle.denominaciones) !== input.monto) return "El total no coincide con las piezas del sencillo.";
  if (motivo === "consignacion" && !input.detalle?.quien?.trim()) return "Escribe quién lleva la plata al banco.";
  if (input.justificacion.trim().length < JUSTIFICACION_CAJA_MIN) return "El ¿por qué? es obligatorio: cuenta de qué es esta plata.";
  if (MOTIVO_CAJA[motivo].foto === "obligatoria" && !input.foto && !input.compraConFactura) return "Falta la foto de la factura (obligatoria).";
  return null;
}

/**
 * A movement still owes its proof: a consignación without the bank receipt,
 * or a supplier payment with no invoice photo anywhere. Shows amber on the
 * tablet and in the owner's list until the photo is added.
 */
export function porConfirmar(m: { motivo: MotivoCaja; fotoPath: string | null; compraConFactura?: boolean; anulado?: boolean }): string | null {
  if (m.anulado || m.fotoPath) return null;
  if (m.motivo === "consignacion") return "falta la foto del comprobante";
  if (m.motivo === "pago_pedido" && !m.compraConFactura) return "falta la foto de la factura";
  return null;
}

/**
 * «¿Un cero de más?»: when a salida is more than the drawer should hold and
 * the same amount without its last zero would fit, offer that one.
 */
export function sugerirCero(monto: number, disponible: number): number | null {
  if (monto <= disponible || monto < 10_000 || monto % 10 !== 0) return null;
  const menos = monto / 10;
  return menos <= disponible ? menos : null;
}

/** Pesos typed on the tablet: "50.000", "50000", "$ 50,000" → 50000. Null when it isn't a whole amount. */
export function parseMonto(text: string): number | null {
  const t = text.replace(/[$\s.,]/g, "");
  if (!/^\d{1,9}$/.test(t)) return null;
  return Number(t);
}

export type Tecla = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "000" | "borrar" | "limpiar";

/** The on-screen keypad: digits as a string, no leading zeros, at most 9 digits. */
export function teclear(actual: string, tecla: Tecla): string {
  if (tecla === "limpiar") return "";
  if (tecla === "borrar") return actual.slice(0, -1);
  const next = (actual + tecla).replace(/^0+/, "");
  return next.length > 9 ? actual : next;
}

/** Totals of a list of movements (voided ones left out). */
export function resumenCaja(rows: ReadonlyArray<{ tipo: TipoMovimiento; monto: number; anulado?: boolean }>): { ingresos: number; salidas: number; neto: number } {
  let ingresos = 0;
  let salidas = 0;
  for (const r of rows) {
    if (r.anulado) continue;
    if (r.tipo === "ingreso") ingresos += r.monto;
    else salidas += r.monto;
  }
  return { ingresos, salidas, neto: ingresos - salidas };
}
