/**
 * How a WhatsApp customer is recognised. The phone number is the main key;
 * when they hide it behind a @username, Meta sends a business-scoped id
 * (BSUID, «RS.…») instead, and the @username is the human-readable fallback
 * (a file can be pre-loaded with just the @username). Pure, so it is tested.
 */
export const esTelefono = (id: string | null | undefined): id is string => !!id && /^\d+$/.test(id);

export type ClavesCliente = { waId: string; userId: string | null; username: string | null };
export type FilaClaves = { wa_id: string | null; user_id: string | null; username: string | null };

/** Normalised @username: no «@», lower case. */
export const usuario = (u: string | null | undefined) => (u ? u.replace(/^@/, "").trim().toLowerCase() || null : null);

/**
 * What to write on a file once we recognise who wrote: fill in the keys it
 * lacks, upgrade a BSUID to a real phone, and follow a changed @username.
 * Never replaces a known phone with a BSUID.
 */
export function enlazarClaves(fila: FilaClaves, c: ClavesCliente): Partial<FilaClaves> {
  const cambios: Partial<FilaClaves> = {};
  if (esTelefono(c.waId) ? fila.wa_id !== c.waId : !fila.wa_id) cambios.wa_id = c.waId;
  const userId = c.userId ?? (esTelefono(c.waId) ? null : c.waId);
  if (userId && fila.user_id !== userId) cambios.user_id = userId;
  const u = usuario(c.username);
  if (u && usuario(fila.username) !== u) cambios.username = u;
  return cambios;
}

/** The phone to look up their orders with, if we know one. */
export function telefonoDe(c: ClavesCliente, fila: FilaClaves | null): string | null {
  if (esTelefono(c.waId)) return c.waId;
  return esTelefono(fila?.wa_id) ? fila!.wa_id : null;
}
