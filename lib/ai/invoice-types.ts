/**
 * Client-safe types and constants for the invoice → inventory feature.
 * Kept separate from `invoice.ts` (which is `server-only` and pulls in the
 * Anthropic SDK) so client components can import UNITS / the item shape.
 */

// Units the inventario form exposes — keep in sync with
// app/(admin)/inventario/actions.ts UNITS.
export const UNITS = [
  "kg", "g", "L", "ml", "und", "porción", "loncha", "bola", "caja", "bulto",
] as const;
export type Unit = (typeof UNITS)[number];

export interface InvoiceItem {
  rawText: string;
  name: string;
  category: string; // suggested category label (Spanish)
  unit: Unit;
  isPack: boolean;
  packQty: number | null; // consumable units per pack when isPack
  lineCost: number; // total COP paid for the line (integer)
  note: string;
}
