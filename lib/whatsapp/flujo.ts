import type { WaEstado } from "@/lib/pos/types";

/**
 * The team's steps on a WhatsApp order (owner, 17-nov). Delivery orders wait
 * for the admin to approve the transfer before they are made; pick-up orders
 * are paid at the café, so they go straight to preparation. Pure, so tested.
 */
export type EventoWa = "aceptar" | "aprobar_pago" | "salio";

/** The next state, or null when that step doesn't apply from here. */
export function siguienteEstado(estado: WaEstado | null | undefined, tipo: string, evento: EventoWa): WaEstado | null {
  const domicilio = tipo === "domicilio";
  if (evento === "aceptar") return estado === "por_aceptar" ? (domicilio ? "esperando_pago" : "en_preparacion") : null;
  if (evento === "aprobar_pago") return estado === "esperando_pago" ? "en_preparacion" : null;
  if (evento === "salio") return domicilio && (estado === "en_preparacion" || estado === "aceptado") ? "en_camino" : null;
  return null;
}

/** Ready for the bar: its comanda and labels should print once. */
export const listoParaPreparar = (estado: WaEstado | null | undefined) => estado === "en_preparacion";

/** How the agent and the POS name each state. */
export const ESTADO_WA_TEXTO: Record<WaEstado, string> = {
  por_aceptar: "esperando que lo aceptemos",
  aceptado: "aceptado",
  esperando_pago: "confirmando su pago",
  en_preparacion: "en preparación",
  en_camino: "en camino con el domiciliario",
  rechazado: "rechazado (ya se le explicó)",
};
