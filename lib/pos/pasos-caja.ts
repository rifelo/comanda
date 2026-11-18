import type { PosOrder } from "./types";

/**
 * Where an in-store order is on the «Caja» board. Paying is not a step: in
 * the café an order may be paid first or after («pagar después»), so it shows
 * as a chip and a button, and a delivered order still owing money waits in
 * the last column until it is charged.
 */
export type PasoCaja = {
  columna: 1 | 2 | 3;
  pasos: readonly string[];
  actual: number;
};

export const PASOS_CAJA = ["Preparar", "Listo", "Entregado"] as const;

type Orden = Pick<PosOrder, "status" | "entregadaAt" | "listoAt" | "total" | "paid">;

export const debe = (o: Pick<PosOrder, "status" | "total" | "paid">) => (o.status === "pagada" ? 0 : Math.max(0, o.total - o.paid));

/** null = not on the board (complete, cancelled). */
export function pasoCaja(o: Orden): PasoCaja | null {
  if (o.status === "cancelada") return null;
  const pagado = debe(o) === 0 && o.status === "pagada";
  if (o.entregadaAt) return pagado ? null : { columna: 3, pasos: PASOS_CAJA, actual: 2 };
  if (o.listoAt) return { columna: 2, pasos: PASOS_CAJA, actual: 1 };
  return { columna: 1, pasos: PASOS_CAJA, actual: 0 };
}
