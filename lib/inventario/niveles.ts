/**
 * Stock levels of an inventory item, pure (no I/O; tested in niveles.test.ts).
 *
 * Three levels per item, the traffic light the barista and the shopping list
 * both read:
 *   rojo     · se acabó — at or under `stock_critico` (or nothing left)
 *   amarillo · poco     — at or under `stock_min`, the reorder point
 *   verde    · hay      — above it
 * `stock_objetivo` ("pedir hasta") is how much there should be after buying.
 *
 * People think in what sits on the shelf (bags, bottles), not in grams, so
 * everything shown or typed goes through the item's piece when it has one:
 * `pieza_qty` stock units per piece (a 900 ml bag), `pack_label` its name.
 * `pack_qty` is something else — the purchase lot (the bale of 12 bags) —
 * and only matters for cost and for rounding what is ordered.
 */

export type Nivel = "verde" | "amarillo" | "rojo";

export const NIVELES: Record<Nivel, { label: string; short: string; color: string }> = {
  verde: { label: "Hay", short: "hay", color: "var(--green)" },
  amarillo: { label: "Poco", short: "poco", color: "var(--amber)" },
  rojo: { label: "Se acabó", short: "se acabó", color: "var(--red)" },
};

/** Zones offered when sorting items by where they are counted (free text is allowed too). */
export const ZONAS = ["Barra", "Nevera", "Vitrina", "Bodega", "Aseo"] as const;

export interface NivelItem {
  unit: string;
  stock_critico: number;
  stock_min: number;
  stock_objetivo: number | null;
  pack_qty: number | null;
  pack_label: string | null;
  /** Stock units in one countable piece; null = counted in the unit itself. */
  pieza_qty?: number | null;
}

/** Where `stock` falls. A level of 0 is "not set": red is then only "nothing left". */
export function nivelDe(stock: number, critico: number, minimo: number): Nivel {
  if (stock <= 0 || (critico > 0 && stock <= critico)) return "rojo";
  if (minimo > 0 && stock <= minimo) return "amarillo";
  return "verde";
}

type Pieza = Pick<NivelItem, "unit" | "pack_qty" | "pieza_qty">;
const esMedida = (unit: string) => /^(g|gr|kg|ml|l|lt|cc|oz)$/i.test(unit.trim());

/**
 * Size of the piece an item is counted and talked about in, in stock units;
 * null when it is counted in the unit itself. The owner sets it per item
 * (bolsa = 900 ml). Things kept by the piece and bought in packs (vasos ×50)
 * fall back to the pack, so closed packs can be counted whole; a measure
 * with no piece (café en g) stays in its unit — "0,2 pacas" helps nobody.
 */
export function piezaDe(it: Pieza): number | null {
  const p = Number(it.pieza_qty ?? 0);
  if (p > 0) return p === 1 ? null : p;
  const pack = Number(it.pack_qty ?? 0);
  return pack > 1 && !esMedida(it.unit) ? pack : null;
}

/** True when the item's levels are typed and read in pieces (measures with a piece set). */
export function usaPaquete(it: Pieza): boolean {
  return Number(it.pieza_qty ?? 0) > 1;
}

/** Name of one pack / several packs ("bolsa" → "bolsas"); "paq." when it has none. */
export function nombrePaquete(it: Pick<NivelItem, "pack_label">, n: number = 1): string {
  const label = (it.pack_label ?? "").trim().toLowerCase();
  if (!label) return "paq.";
  if (n === 1) return label;
  return /[aeiouáéíóú]$/.test(label) ? `${label}s` : /s$/.test(label) ? label : `${label}es`;
}

const trim = (n: number, decimals = 2) => {
  const f = 10 ** decimals;
  return String(Math.round(n * f) / f).replace(".", ",");
};

/** Stock units → what is typed in the levels table (packs when the item has one). */
export function aEntrada(qty: number, it: Pieza): number {
  return usaPaquete(it) ? Math.round((qty / Number(it.pieza_qty)) * 100) / 100 : qty;
}
/** What was typed → stock units. */
export function deEntrada(value: number, it: Pieza): number {
  return usaPaquete(it) ? Math.round(value * Number(it.pieza_qty) * 1000) / 1000 : value;
}

/** "2 bolsas", "½ caja", "350 g" — a quantity the way it is said at the bar. */
export function cantidadLegible(qty: number, it: Pieza & Pick<NivelItem, "pack_label">): string {
  if (!usaPaquete(it)) return `${trim(qty)} ${it.unit}`;
  const packs = qty / Number(it.pieza_qty);
  if (Math.abs(packs - 0.5) < 0.005) return `½ ${nombrePaquete(it, 1)}`;
  return `${trim(packs, 1)} ${nombrePaquete(it, packs)}`;
}

/** Whole pieces plus loose units: how a shelf is counted ("2 bolsas + 300 ml"). `packQty` = piezaDe(item). */
export function enPaquetes(qty: number, packQty: number | null): { packs: number; sueltos: number } {
  if (!packQty || packQty <= 1 || qty <= 0) return { packs: 0, sueltos: Math.max(0, qty) };
  const packs = Math.floor(qty / packQty + 1e-9);
  return { packs, sueltos: Math.round((qty - packs * packQty) * 1000) / 1000 };
}
export function dePaquetes(packs: number, sueltos: number, packQty: number | null): number {
  return Math.round(((packQty && packQty > 1 ? packs * packQty : 0) + sueltos) * 1000) / 1000;
}

/**
 * The line under an item on the tablet: what "poco" and "se acabó" mean for
 * it, in packs. Null when the item has no levels yet.
 */
export function guiaNivel(it: NivelItem): string | null {
  const parts: string[] = [];
  if (it.stock_min > 0) parts.push(`Poco: ${cantidadLegible(it.stock_min, it)} o menos`);
  if (it.stock_critico > 0) parts.push(`Se acabó: ${cantidadLegible(it.stock_critico, it)} o menos`);
  return parts.length ? parts.join(" · ") : null;
}

/**
 * How much to order: only once the item is at or under its reorder point,
 * enough to get back to "pedir hasta" (twice the reorder point when that was
 * never set), rounded up to whole packs. `qty` is in stock units.
 */
export function sugerido(stock: number, it: Pick<NivelItem, "stock_min" | "stock_objetivo" | "pack_qty">): { qty: number; packs: number | null } {
  // Orders always go out in whole packs, whatever unit the item is kept in.
  const porPaquete = (it.pack_qty ?? 0) > 1;
  const none = { qty: 0, packs: porPaquete ? 0 : null };
  if (it.stock_min <= 0 && !it.stock_objetivo) return none;
  if (stock > it.stock_min && stock > 0) return none;
  const target = it.stock_objetivo ?? it.stock_min * 2;
  const need = target - Math.max(0, stock);
  if (need <= 0) return none;
  if (porPaquete) {
    const packs = Math.ceil(need / it.pack_qty! - 1e-9);
    return { qty: packs * it.pack_qty!, packs };
  }
  return { qty: Math.ceil(need - 1e-9), packs: null };
}

/**
 * Levels must be ordered (se acabó < poco < pedir hasta) or the colours and
 * the suggestions contradict each other. Returns the problem in Spanish, or
 * null when the three make sense (0 / null = not set, always fine).
 */
export function validarNiveles(critico: number, minimo: number, objetivo: number | null): string | null {
  if (critico < 0 || minimo < 0 || (objetivo !== null && objetivo <= 0)) return "Los niveles no pueden ser negativos.";
  if (critico > 0 && minimo > 0 && critico >= minimo) return "«Se acabó» debe ser menor que «Poco».";
  if (objetivo !== null && minimo > 0 && objetivo <= minimo) return "«Pedir hasta» debe ser mayor que «Poco».";
  if (objetivo !== null && critico > 0 && objetivo <= critico) return "«Pedir hasta» debe ser mayor que «Se acabó».";
  return null;
}
