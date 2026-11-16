/**
 * Pure helpers for how the agent paces a conversation. A chat that went quiet
 * for a while starts over (like a person at the counter greeting a customer
 * who comes back later); what we know of them lives in their client file.
 */
export const SILENCIO_NUEVA_SESION_MS = 60 * 60 * 1000;

/** Keep only the latest session: everything after the last silence longer than `silencioMs`. */
export function ultimaSesion<T extends { at: Date }>(turnos: T[], silencioMs = SILENCIO_NUEVA_SESION_MS): T[] {
  let desde = 0;
  for (let i = 1; i < turnos.length; i++) {
    if (turnos[i].at.getTime() - turnos[i - 1].at.getTime() > silencioMs) desde = i;
  }
  return turnos.slice(desde);
}

/** WhatsApp's per-recipient limit answers 429; Meta allows ~1 message every 6 s to the same person. */
export const esLimitePorNumero = (mensaje: string) => /\b429\b|131056|too many requests/i.test(mensaje);
export const ESPERA_LIMITE_MS = 6_500;

/** What is new since the agent last answered: the customer's messages and the team's. */
export function nuevoDesdeRespuesta<T extends { autor: "cliente" | "agente" | "equipo"; texto: string }>(turnos: T[]): { cliente: string; equipo: string[] } {
  let desde = 0;
  for (let i = turnos.length - 1; i >= 0; i--) {
    if (turnos[i].autor === "agente") {
      desde = i + 1;
      break;
    }
  }
  const nuevos = turnos.slice(desde);
  return {
    cliente: nuevos.filter((t) => t.autor === "cliente").map((t) => t.texto).join("\n"),
    equipo: nuevos.filter((t) => t.autor === "equipo").map((t) => t.texto),
  };
}

/** A session is reused while the chat is active (same rule as the history cut). */
export function sesionVigente(ultima: Date | null, ahora = new Date(), silencioMs = SILENCIO_NUEVA_SESION_MS): boolean {
  return !!ultima && ahora.getTime() - ultima.getTime() <= silencioMs;
}
