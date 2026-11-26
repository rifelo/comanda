import type { WaEstado } from "@/lib/pos/types";

/**
 * The team's steps on a WhatsApp order (owner, 17-nov; POS paso a paso).
 *   domicilio: Nuevo → Pago (admin) → Preparar → Domiciliario → Entregado
 *   recoger:   Nuevo → Preparar → Listo → Entregado (paga al recoger)
 *   cercano:   Nuevo → Preparar → Llevar → Entregado (paga al recibir)
 * Delivery orders wait for the admin to approve the transfer before they are
 * made; pick-up and nearby points go straight to preparation. Pure, so tested.
 */
export type EventoWa = "aceptar" | "aprobar_pago" | "listo" | "salio";

/** How the order reaches the customer. */
export type TipoWa = "domicilio" | "recoge" | "cercano";

/**
 * From the stored order: a free nearby point is a «llevar» order the team
 * walks over (se_lo_llevamos + the point as its address).
 */
export function tipoWa(o: { orderType: string; seLoLlevamos?: boolean | null; direccion?: string | null }): TipoWa {
  if (o.orderType === "domicilio") return "domicilio";
  return o.seLoLlevamos && !!o.direccion ? "cercano" : "recoge";
}

/** The next state, or null when that step doesn't apply from here. */
export function siguienteEstado(estado: WaEstado | null | undefined, tipo: TipoWa | string, evento: EventoWa): WaEstado | null {
  const domicilio = tipo === "domicilio";
  const preparando = estado === "en_preparacion" || estado === "aceptado";
  if (evento === "aceptar") return estado === "por_aceptar" ? (domicilio ? "esperando_pago" : "en_preparacion") : null;
  if (evento === "aprobar_pago") return estado === "esperando_pago" ? "en_preparacion" : null;
  // A nearby point goes out as soon as it is ready («Listo · llevarlo» = salió).
  if (evento === "listo") return preparando && tipo !== "cercano" ? "listo" : null;
  if (evento === "salio") {
    if (domicilio) return preparando || estado === "listo" ? "en_camino" : null;
    if (tipo === "cercano") return preparando || estado === "listo" ? "en_camino" : null;
    return null;
  }
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
  listo: "listo (para recoger, o esperando al domiciliario si es domicilio)",
  en_camino: "en camino",
  rechazado: "rechazado (ya se le explicó)",
};

/** States the WhatsApp board shows (the rest are done, turned down, or older orders). */
export const ESTADOS_TABLERO: readonly WaEstado[] = ["por_aceptar", "esperando_pago", "en_preparacion", "aceptado", "listo", "en_camino"];

export type PasoWa = {
  tipo: TipoWa;
  /** Step names for the stepper, in order. */
  pasos: string[];
  /** Index of the step the order is on now. */
  actual: number;
  /** Board column: 1 Por aceptar · 2 Esperando pago · 3 Preparar · 4 Salida y entrega. */
  columna: 1 | 2 | 3 | 4;
};

const PASOS: Record<TipoWa, string[]> = {
  domicilio: ["Nuevo", "Pago", "Preparar", "Domiciliario", "Entregado"],
  recoge: ["Nuevo", "Preparar", "Listo", "Entregado"],
  cercano: ["Nuevo", "Preparar", "Llevar", "Entregado"],
};

/**
 * Where a WhatsApp order stands in its flow, or null when it isn't on the
 * board (turned down, delivered and paid, or not a WhatsApp flow order).
 */
export function pasoWa(o: {
  orderType: string;
  seLoLlevamos?: boolean | null;
  direccion?: string | null;
  waEstado?: WaEstado | null;
  entregadaAt?: string | null;
}): PasoWa | null {
  const e = o.waEstado;
  if (!e || !ESTADOS_TABLERO.includes(e)) return null;
  const tipo = tipoWa(o);
  const pasos = PASOS[tipo];
  if (e === "por_aceptar") return { tipo, pasos, actual: 0, columna: 1 };
  if (e === "esperando_pago") return { tipo, pasos, actual: 1, columna: 2 };
  if (e === "en_preparacion" || e === "aceptado") return { tipo, pasos, actual: tipo === "domicilio" ? 2 : 1, columna: 3 };
  if (e === "listo") return { tipo, pasos, actual: tipo === "domicilio" ? 3 : 2, columna: 4 };
  // en_camino: a delivery is on its last step; a nearby point is being walked over.
  return { tipo, pasos, actual: tipo === "domicilio" ? 4 : 2, columna: 4 };
}

/** Did we already send the payment details in this session? (any line of them, from the agent or the team). */
export function pagosEnConversacion(turnos: { autor: string; texto: string }[], pagos: string | null): boolean {
  const lineas = (pagos ?? "").split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter((l) => l.length >= 6);
  if (!lineas.length) return false;
  return turnos.some((t) => t.autor !== "cliente" && lineas.some((l) => t.texto.replace(/\s+/g, " ").includes(l)));
}

/** $7.000 — by hand so server and browser agree. */
export const pesosCop = (n: number) => `$${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;

/** Who pays the courier of a WhatsApp delivery, for the team (null = no fee set). */
export function textoDomicilio(cop: number | null | undefined, transferido: boolean | null | undefined): string | null {
  if (cop == null) return null;
  if (cop === 0) return "Sin costo";
  const v = pesosCop(cop);
  if (transferido === true) return `${v} · vino en la transferencia: se lo pagamos al domiciliario`;
  if (transferido === false) return `${v} · el cliente se lo paga al domiciliario`;
  return `${v} · el cliente lo suma a la transferencia o se lo paga al domiciliario`;
}

/** «gracias», «muchas gracias», «mil gracias», «Dios le pague»… */
export function agradece(texto: string): boolean {
  return /\bgraci+a+s*\b|\bdios (?:le|te|les) pague\b|\bthank/i.test(texto.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
}

/**
 * How long the agent waits for the customer to finish a burst before
 * answering. Measured on 14 days of chats (178 back-to-back messages):
 * 4 s grouped 45 %, 10 s groups 80 %. After a bare greeting («Hola»,
 * «Buen día») the order usually comes within half a minute, so it waits
 * longer instead of answering the greeting on its own.
 */
export function esperaRafagaMs(texto: string | null | undefined): number {
  const t = (texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-zñ ]+/g, " ").replace(/\s+/g, " ").trim();
  const soloSaludo = /^(?:(?:hola|holi|ola|buenas|buen dia|buenos dias|buenas tardes|buenas noches|buen diaa|que mas|oye|doc|vecina?|veci|una pregunta|pregunta|disculpa|disculpe)\s?)+$/.test(t);
  return soloSaludo ? 25_000 : 10_000;
}

const sinTildes = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** The order the cafepayo.com menu sends («Hola, quiero hacer este pedido: …»). */
export const esPedidoDelMenu = (texto: string | null) => !!texto && /^hola, quiero hacer este pedido:/i.test(texto.trim());

/** The customer asks how to pay by transfer (llave, Nequi, cuenta, QR…). */
export function pidePagos(texto: string): boolean {
  const t = sinTildes(texto);
  return /\bllaves?\b|\bnequi\b|\bdaviplata\b|\bbold\b|\bqr\b|numero de cuenta|\bcuenta\b.*\b(transfer|consign)|\b(transferir|transfiero|transferencia|consignar|consigno|consignacion)\b/.test(t);
}

/** Everything the customer wrote since our last message (the burst being answered). */
export function textoDesdeRespuesta(turnos: { autor: string; texto: string }[]): string {
  const i = turnos.map((t) => t.autor).lastIndexOf("agente");
  return turnos.slice(i + 1).filter((t) => t.autor === "cliente").map((t) => t.texto).join("\n");
}

/** Our reply is an order summary waiting for the customer's «sí». */
export const pideConfirmacion = (texto: string) => /\blo (enviamos|cambiamos|dejamos) as[ií]\s*\?/i.test(texto);

/** The one reminder after an unanswered summary. */
export function textoRecordarConfirmacion(nombre: string | null): string {
  // «Doc. Bibiana» stays whole; a profile name gives its first word if it is a name (not «❤️» or «[]»).
  const t = (nombre ?? "").trim();
  const n = /^(doc|dr|dra|don|doña|profe|seño)\.?\s/i.test(t) ? t : (t.split(/\s+/)[0] ?? "");
  return /^\p{L}/u.test(n) ? `${n}, te lo enviamos así? 🙌` : "Te lo enviamos así? 🙌";
}
