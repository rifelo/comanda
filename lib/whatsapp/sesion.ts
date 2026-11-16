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
