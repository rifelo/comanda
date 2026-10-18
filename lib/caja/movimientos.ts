/**
 * Cash that enters or leaves the drawer without being a sale: the change
 * float someone brings to operate, a supplier paid in cash when the order
 * arrives. Pure helpers — reasons, validation, totals. No I/O; unit-tested in
 * movimientos.test.ts. The writes live in lib/caja/movimientos-db.ts.
 */

export type TipoMovimiento = "ingreso" | "salida";
export const MOTIVOS_CAJA = ["sencillo", "aporte", "pago_pedido", "compra_menor", "retiro", "otro"] as const;
export type MotivoCaja = (typeof MOTIVOS_CAJA)[number];

export const MOTIVO_CAJA: Record<MotivoCaja, { label: string; tipo: TipoMovimiento | "ambos"; hint: string }> = {
  sencillo: { label: "Sencillo", tipo: "ingreso", hint: "Billetes y monedas que se depositan para dar cambio" },
  aporte: { label: "Aporte del dueño", tipo: "ingreso", hint: "Plata que se agrega a la caja para operar" },
  pago_pedido: { label: "Pago de pedido", tipo: "salida", hint: "Se pagó en efectivo un pedido que llegó" },
  compra_menor: { label: "Compra menor", tipo: "salida", hint: "Algo que se compró afuera (hielo, servilletas…)" },
  retiro: { label: "Retiro", tipo: "salida", hint: "El dueño se llevó plata de la caja" },
  otro: { label: "Otro", tipo: "ambos", hint: "Cuéntalo en la justificación" },
};

/** Reasons offered for an ingreso or a salida (the order payment comes from Recibir, not from here). */
export function motivosDe(tipo: TipoMovimiento, opts: { conPagoPedido?: boolean } = {}): MotivoCaja[] {
  return MOTIVOS_CAJA.filter((m) => {
    const t = MOTIVO_CAJA[m].tipo;
    if (m === "pago_pedido" && !opts.conPagoPedido) return false;
    return t === tipo || t === "ambos";
  });
}

export const JUSTIFICACION_CAJA_MIN = 5;
export const MONTO_CAJA_MAX = 20_000_000;

/** Why a movement can't be saved yet, or null when it can. */
export function errorMovimiento(input: { tipo: string | null; monto: number | null; motivo: string | null; justificacion: string }): string | null {
  if (input.tipo !== "ingreso" && input.tipo !== "salida") return "Elige si entra o sale plata.";
  if (input.monto === null || !Number.isInteger(input.monto) || input.monto <= 0) return "Escribe el monto en pesos.";
  if (input.monto > MONTO_CAJA_MAX) return "Ese monto es demasiado grande; revisa los ceros.";
  if (!input.motivo || !(MOTIVOS_CAJA as readonly string[]).includes(input.motivo)) return "Elige el motivo.";
  const t = MOTIVO_CAJA[input.motivo as MotivoCaja].tipo;
  if (t !== "ambos" && t !== input.tipo) return "Ese motivo no corresponde.";
  if (input.justificacion.trim().length < JUSTIFICACION_CAJA_MIN) return "La justificación es obligatoria: cuenta de qué es esta plata.";
  return null;
}

/** Pesos typed on the tablet: "50.000", "50000", "$ 50,000" → 50000. Null when it isn't a whole amount. */
export function parseMonto(text: string): number | null {
  const t = text.replace(/[$\s.,]/g, "");
  if (!/^\d{1,9}$/.test(t)) return null;
  return Number(t);
}

/** Totals of a list of movements. */
export function resumenCaja(rows: ReadonlyArray<{ tipo: TipoMovimiento; monto: number }>): { ingresos: number; salidas: number; neto: number } {
  let ingresos = 0;
  let salidas = 0;
  for (const r of rows) {
    if (r.tipo === "ingreso") ingresos += r.monto;
    else salidas += r.monto;
  }
  return { ingresos, salidas, neto: ingresos - salidas };
}
