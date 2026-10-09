/**
 * The customers' QR menu, pure (no I/O; tested in menu.test.ts).
 *
 * Two sources, merged by SKU: the POS catalog says what exists, what it is
 * called, what it costs and whether it is sold out; `menu.json` adds what
 * only the menu has — the copy, the flavour profile, the moods, the promo
 * banner. A product missing from the catalog never shows; one that is in the
 * catalog but not in the JSON shows with its catalog description, so the
 * menu follows the POS without anyone editing two lists.
 */

export interface MenuContentItem {
  /** Overrides the catalog name on the menu ("Kombucha de maracuyá"). */
  name?: string;
  short?: string;
  desc?: string;
  lleva?: string[];
  /** Intensidad, dulzor, acidez, cremosidad — 0 to 5 each. */
  p?: number[];
  tags?: string[];
  nuevo?: boolean;
}
export interface MenuContent {
  organizationId: string;
  header: { titulo: string; texto: string };
  footer: { tagline: string; texto: string; instagram: string };
  /** The featured drinks at the top: one panel, one row per product on the menu. */
  promo: { on: boolean; sticker: string; items: { sku: string; tagline: string }[] };
  /** Brand art by file name → public path, or null while the file is missing. */
  arte: Record<string, string | null>;
  categories: { id: string; pos: string[]; label: string; sub: string; pair: string | null; art: string | null }[];
  moods: { id: string; label: string; hint: string }[];
  profileLabels: string[];
  items: Record<string, MenuContentItem>;
}

/** A product as the catalog has it. */
export interface CatalogProduct {
  sku: string;
  name: string;
  price: number;
  /** 'sin' = sold out today. */
  stock: string;
  description: string | null;
  /** Label of its POS category ("Frío", "Jugos"). */
  category: string | null;
  /** Options of its required single-choice modifier group, if it has one. */
  options: { name: string; delta: number }[];
}

export interface MenuItem {
  sku: string;
  cat: string;
  name: string;
  price: number;
  short: string;
  desc: string;
  lleva: string[];
  p: number[] | null;
  tags: string[];
  nuevo: boolean;
  agotado: boolean;
  options: { name: string; delta: number }[];
}
export interface MenuSection {
  id: string;
  label: string;
  sub: string;
  art: string | null;
  pair: string | null;
  items: MenuItem[];
}

/** "$8.500" — Colombian thousands, no decimals. */
export function money(n: number): string {
  return "$" + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** The first sentence, without its final period: a catalog description as a one-liner. */
function corta(text: string): string {
  const first = text.split(/(?<=[.!?])\s+/)[0] ?? text;
  return first.replace(/\.$/, "");
}

/**
 * The sections of the menu, in the JSON's order, each with the products the
 * catalog files under one of its POS categories, cheapest first. Leaves out what has no
 * price yet (a product being set up) and the sections left empty.
 */
export function buildMenu(content: MenuContent, products: ReadonlyArray<CatalogProduct>): MenuSection[] {
  const sections = content.categories.map((c) => ({ id: c.id, label: c.label, sub: c.sub, art: c.art, pair: c.pair, items: [] as MenuItem[] }));
  const catOf = new Map<string, string>();
  for (const c of content.categories) for (const label of c.pos) catOf.set(label.toLowerCase(), c.id);
  for (const p of [...products].sort((a, b) => a.sku.localeCompare(b.sku))) {
    if (p.price <= 0) continue;
    const cat = p.category ? catOf.get(p.category.toLowerCase()) : undefined;
    const section = sections.find((s) => s.id === cat);
    if (!section) continue;
    const extra = content.items[p.sku] ?? {};
    const descr = (p.description ?? "").trim();
    section.items.push({
      sku: p.sku,
      cat: section.id,
      name: extra.name ?? p.name,
      price: p.price,
      short: extra.short ?? corta(descr),
      desc: extra.desc ?? descr,
      lleva: extra.lleva ?? [],
      p: extra.p && extra.p.length ? extra.p : null,
      tags: extra.tags ?? [],
      nuevo: extra.nuevo === true,
      agotado: p.stock === "sin",
      options: p.options,
    });
  }
  // Cheapest first, so each section reads as a ladder of prices; same price, by name.
  for (const s of sections) s.items.sort(porPrecio);
  const visibles = sections.filter((s) => s.items.length > 0);
  // A pairing that is not on the menu is no pairing.
  const skus = new Set(visibles.flatMap((s) => s.items.map((i) => i.sku)));
  return visibles.map((s) => ({ ...s, pair: s.pair && skus.has(s.pair) ? s.pair : null }));
}

/** Ascending by price, then by name. */
export function porPrecio(a: MenuItem, b: MenuItem): number {
  return a.price - b.price || a.name.localeCompare(b.name, "es");
}

/** What the customer says at the table: «Jugo de mora en leche». */
export function fraseDePedido(name: string, option: string | null): string {
  return `«${name}${option ? ` ${option.charAt(0).toLowerCase()}${option.slice(1)}` : ""}»`;
}
