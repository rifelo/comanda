/**
 * Test mode: while `agente_activo` is off, the agent still answers these
 * numbers (WHATSAPP_PROBADORES, comma-separated, digits with country code as
 * WhatsApp sends them, e.g. 573001234567). Everyone else is left alone.
 */
export function atiendeA(agenteActivo: boolean, waId: string, probadores = process.env.WHATSAPP_PROBADORES ?? ""): boolean {
  if (agenteActivo) return true;
  const digitos = (s: string) => s.replace(/\D/g, "");
  return probadores.split(",").map(digitos).filter(Boolean).includes(digitos(waId));
}
