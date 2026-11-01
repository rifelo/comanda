/**
 * «Recomiéndale» — the right rail of the product options page.
 *
 * Everything comes from data, never from copy written per product:
 *   · script      productos.recomendacion («Dilo así»), what the barista says
 *   · pairings    what sells on the same orders (catalog.pairs, last 30 days)
 *   · combos      active combos that include the product
 *   · lowStock    products running low today («agótala hoy»)
 * plus the availability of the product's category («Jugos hoy»).
 */
import type { PosCatalog, PosCombo, PosMenuItem } from "./types";

export interface RecPairing {
  item: PosMenuItem;
  /** Share (0–100) of the product's orders that also had this one. */
  pct: number;
}

export interface Recomendaciones {
  /** What to say to upsell the product itself; null = nothing written yet. */
  script: string | null;
  /**
   * How often the script works (0–100). No data source yet: stays null
   * until the POS records when a suggestion is taken.
   */
  conversionPct: number | null;
  pairings: RecPairing[];
  combos: PosCombo[];
  lowStock: PosMenuItem[];
}

const sellable = (p: PosMenuItem | undefined): p is PosMenuItem => !!p && p.stock !== "sin";

export function recomendacionesFor(catalog: PosCatalog, productId: string, max = 4): Recomendaciones {
  const product = catalog.byId[productId];
  const pairings = (catalog.pairs[productId] ?? [])
    .map((p) => ({ item: catalog.byId[p.id], pct: p.pct }))
    .filter((p): p is RecPairing => sellable(p.item))
    .slice(0, max);
  const combos = catalog.combos
    .filter((c) => c.items.includes(productId) && c.items.every((id) => sellable(catalog.byId[id])))
    .slice(0, 2);
  const shown = new Set([productId, ...pairings.map((p) => p.item.id)]);
  const lowStock = catalog.menu.filter((m) => m.stock === "bajo" && !shown.has(m.id)).slice(0, 2);
  return {
    script: product?.script ?? null,
    conversionPct: null,
    pairings,
    combos,
    lowStock,
  };
}

export interface Disponibilidad {
  /** Tab label of the category, e.g. «Jugos». */
  label: string;
  hay: string[];
  agotados: string[];
}

/** What's left today in the product's category, for the «Jugos hoy» card. */
export function disponibilidadDe(catalog: PosCatalog, productId: string): Disponibilidad | null {
  const product = catalog.byId[productId];
  if (!product) return null;
  const same = catalog.menu.filter((m) => m.catId === product.catId);
  if (same.length < 2) return null;
  return {
    label: catalog.catLabel[product.catId] ?? product.sub ?? "",
    hay: same.filter((m) => m.stock !== "sin").map((m) => m.name),
    agotados: same.filter((m) => m.stock === "sin").map((m) => m.name),
  };
}
