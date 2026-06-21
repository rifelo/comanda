// Shared POS types. These mirror the shapes the terminal UI consumes, but with
// ids generalized to strings (real Supabase UUIDs) instead of the old demo
// enum ids. The server adapter (lib/pos/catalog.ts) produces a PosCatalog; the
// AI assistant (lib/ai/pos-assistant.ts) produces PosSuggest[] grounded on the
// same ids. Everything here is plain/serializable so it crosses the
// server→client boundary as props.

export type PosStockStatus = "ok" | "bajo" | "sin";
export type PosModType = "single" | "multi";

export interface PosMenuItem {
  id: string;
  name: string;
  /** Top-level category id this product lives under (a tab in the catalog). */
  catId: string;
  /** Sub-category label, "" when the product sits directly on a top-level cat. */
  sub: string;
  sku: string;
  price: number;
  /** True when the item is known to contain gluten. Defaults to true (unknown)
   *  because productos has no allergen column yet — never claim "sin gluten"
   *  without data. */
  gluten: boolean;
  fav: boolean;
  stock: PosStockStatus;
  /** Modifier group ids that apply to this product. */
  mods: string[];
  desc: string;
}

export interface PosCombo {
  id: string;
  name: string;
  /** Product ids bundled in the combo (for the client-facing description). */
  items: string[];
  price: number;
  desc: string;
  /** Pre-computed regular-total minus combo price. */
  saving: number;
}

export interface PosModOption {
  name: string;
  delta: number;
}

export interface PosModGroup {
  id: string;
  name: string;
  type: PosModType;
  required: boolean;
  options: PosModOption[];
}

export interface PosCat {
  id: string;
  label: string;
}

/** The full live catalog handed to the terminal. */
export interface PosCatalog {
  /** Tab order: synthetic "fav" first, real top-level cats, "combo" last. */
  cats: PosCat[];
  menu: PosMenuItem[];
  combos: PosCombo[];
  modGroups: Record<string, PosModGroup>;
  byId: Record<string, PosMenuItem>;
  comboById: Record<string, PosCombo>;
  catLabel: Record<string, string>;
  orgName: string;
}

/** Catalog narrowed by the assistant to what the customer asked for. */
export interface PosCatalogFilter {
  label: string; // short description, e.g. "Bebidas frías" / "Sin gluten"
  ids: string[]; // matching product ids
}

// ── AI assistant shapes ─────────────────────────────────────────
export type PosSuggestKind =
  | "pedido"
  | "combo"
  | "upsell"
  | "modificador"
  | "agotado"
  | "alergia"
  | "atencion"
  | "fidelidad";

export type PosAct =
  | { type: "add"; id: string }
  | { type: "combo"; id: string }
  | { type: "swapCombo"; removeId: string; comboId: string }
  | { type: "mods"; id: string; set: Record<string, string | string[]> }
  | { type: "flag"; value?: string }
  | { type: "loyalty" };

export interface PosSuggest {
  kind: PosSuggestKind;
  title: string;
  detail?: string;
  /** Optional line for the cashier to say out loud. */
  say?: string;
  actionLabel?: string;
  act?: PosAct;
  /** Optional UI focus hint (open a category / highlight a product). */
  focus?: { catId?: string; highlightId?: string | null };
}

export const POS_SUGGEST_KINDS: PosSuggestKind[] = [
  "pedido",
  "combo",
  "upsell",
  "modificador",
  "agotado",
  "alergia",
  "atencion",
  "fidelidad",
];

export const POS_KIND_LABEL: Record<PosSuggestKind, string> = {
  pedido: "Pedido",
  combo: "Combo",
  upsell: "Sugerencia",
  modificador: "Personaliza",
  agotado: "Agotado",
  alergia: "Alergia",
  atencion: "Atención",
  fidelidad: "Fidelidad",
};

/** Deterministic COP formatter (es-CO grouping, no decimals) — safe for SSR. */
export const posMoney = (n: number): string =>
  "$" + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");

export const FAV_CAT = "fav";
export const COMBO_CAT = "combo";
