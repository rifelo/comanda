// Premios Mi Pa'Yo (owner, 2026-11-14 — docs/marketing/premios-mi-payo.md).
// Pure and tested: the reward ladder, the progress toward the next one, the
// welcome bonus and the morning double. The redemption code is in
// premios-codigo.ts (server only: it signs with a secret).

import { bogota } from "./mi-payo";

export interface Premio {
  id: "clasico" | "la-que-quieras";
  puntos: number;
  titulo: string;
  detalle: string;
  /** Highest list price of the drink it pays for (null = any drink). */
  maxPrecio: number | null;
}

/** The rewards, cheapest first. Spending one subtracts its points. */
export const PREMIOS: readonly Premio[] = [
  { id: "clasico", puntos: 50, titulo: "Un clásico por nosotros", detalle: "Tinto, café con leche, espresso o aromática", maxPrecio: 4000 },
  { id: "la-que-quieras", puntos: 100, titulo: "La que quieras va por nosotros", detalle: "Cualquier bebida de la carta", maxPrecio: null },
];

export const premioPorId = (id: string): Premio | null => PREMIOS.find((p) => p.id === id) ?? null;

/** Points the first scan with an @ adds on top of the purchase. */
export const BONO_BIENVENIDA = 10;

/** Orders placed before this Bogotá hour earn double points. */
export const HORA_FIN_MANANA = 9;

/** True when an order placed at `iso` earns the morning double. */
export const esMananaDoble = (iso: string | Date): boolean => bogota(iso).h < HORA_FIN_MANANA;

/** A purchase's points with the morning double applied. */
export const conMananaDoble = (puntos: number, iso: string | Date): number => (esMananaDoble(iso) ? puntos * 2 : puntos);

export interface Progreso {
  /** The next reward not yet reachable; null when every reward is reachable. */
  siguiente: Premio | null;
  faltan: number;
  /** 0–100, toward `siguiente` (100 when everything is reachable). */
  pct: number;
  /** Rewards the balance already pays for. */
  disponibles: Premio[];
}

export function progreso(puntos: number): Progreso {
  const p = Math.max(0, Math.floor(puntos));
  const disponibles = PREMIOS.filter((x) => p >= x.puntos);
  const siguiente = PREMIOS.find((x) => p < x.puntos) ?? null;
  return {
    siguiente,
    faltan: siguiente ? siguiente.puntos - p : 0,
    pct: siguiente ? Math.round((p / siguiente.puntos) * 100) : 100,
    disponibles,
  };
}

/** Why a drink can't be the reward (null = it can). `printsLabel` marks prepared drinks. */
export function motivoNoAplica(premio: Premio, producto: { price: number; printsLabel: boolean }, qtyEnPedido: number): string | null {
  if (!producto.printsLabel) return "El premio es una bebida preparada.";
  if (premio.maxPrecio !== null && producto.price > premio.maxPrecio) return `«${premio.titulo}» es para bebidas de hasta $${premio.maxPrecio.toLocaleString("es-CO")}.`;
  if (qtyEnPedido !== 1) return "Deja solo una de esa bebida en el pedido: el premio es una.";
  return null;
}
