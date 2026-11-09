import type { MenuSection } from "./menu";

export interface Favorita {
  sku: string;
  name: string;
  price: number;
  /** «Frío, con café» for coffee-bar drinks; the item's one-liner otherwise. */
  nota: string;
}

/** Sections whose drinks read «Caliente/Frío, con/sin café». */
const BARRA = new Set(["caliente", "frio"]);

/**
 * Up to `n` menu items for «Las favoritas del mes»: the promo SKUs in their
 * order, then the best sellers of the month (most units first), never a sold-out
 * item or one that is not on the menu.
 */
export function elegirFavoritas(secciones: ReadonlyArray<MenuSection>, promo: ReadonlyArray<string>, vendidos: ReadonlyMap<string, number>, n: number): Favorita[] {
  const porSku = new Map(secciones.flatMap((s) => s.items.map((i) => [i.sku, { item: i, seccion: s }] as const)));
  const orden = [
    ...promo,
    ...[...vendidos.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([sku]) => sku),
  ];
  const out: Favorita[] = [];
  for (const sku of orden) {
    if (out.length >= n) break;
    const e = porSku.get(sku);
    if (!e || e.item.agotado || out.some((f) => f.sku === sku)) continue;
    const nota = BARRA.has(e.seccion.id) ? `${e.seccion.label}, ${e.item.cafe ? "con café" : "sin café"}` : e.item.short;
    out.push({ sku, name: e.item.name, price: e.item.price, nota });
  }
  return out;
}
