/**
 * Printed pieces with their own QR: cafepayo.com/desde/<origen> counts the
 * scan (menu_visitas) and opens the menu with the order button of that place.
 * Pure: the slug rules and the WhatsApp link.
 */

/** The café's WhatsApp, where orders are taken (wa.me format). */
export const WHATSAPP_PEDIDOS = "573001269607";

export interface Origen {
  /** What the place is called in the banner. */
  nombre: string;
  /** Where the order is handed over. */
  entrega: string;
}

/** Places that have a printed piece. An unknown slug is still counted; it just gets no banner. */
export const ORIGENES: Record<string, Origen> = {
  "ese-salud-yopal": { nombre: "ESE Salud Yopal", entrega: "la portería" },
};

/** A slug as it goes in the URL and the table: a–z, 0–9 and hyphens, 40 at most; null when nothing usable is left. */
export function normalizarOrigen(raw: string | null | undefined): string | null {
  const s = (raw ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return s || null;
}

/** The WhatsApp chat with the order already started for that place. */
export function enlacePedido(origen: string): string | null {
  const o = ORIGENES[origen];
  if (!o) return null;
  const texto = `Hola, quiero pedir para ${o.entrega} de ${o.nombre}`;
  return `https://wa.me/${WHATSAPP_PEDIDOS}?text=${encodeURIComponent(texto)}`;
}
