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
  /** Gets the menu cup label when sold: prepared drinks only, never food
   *  and never a bottle handed over as it is. */
  printsLabel: boolean;
  /** Spec box of the cup label, e.g. ["2 SHOTS · 18 G"]. */
  spec: string[];
  /** Product photo uploaded from the catálogo (public URL), if any. */
  image: string | null;
  /** The recipe as the barista reads it: one line per ingredient, in order. */
  recipe: PosRecipeLine[];
}

export interface PosRecipeLine {
  name: string;
  qty: number;
  unit: string;
  note: string | null;
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
  /** Instagram handle without "@" (organizations.instagram), null = none. */
  instagram: string | null;
  /** Brand sticker image for the label printer (organizations.sticker_url), null = none. */
  sticker: string | null;
  /** Brand line art for the "síguenos" QR label (organizations.cup_url), null = none. */
  cupArt: string | null;
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

// ── ticket lines + pending orders ───────────────────────────────
export type OrderType = "aqui" | "llevar" | "domicilio";
/** Modifier selections on a ticket line: group id → option name(s). */
export type ModSelection = Record<string, string | string[] | null>;

/** A line on the cashier's ticket (client-side cart shape). */
export interface OrderLine {
  id: string;
  name: string;
  qty: number;
  kind: "item" | "combo";
  basePrice?: number;
  price?: number;
  gluten?: boolean;
  items?: string[];
  mods?: ModSelection;
  hasMods?: boolean;
  expanded?: boolean;
  /** Product/combo no longer in the catalog — rebuilt from the order snapshot. */
  missing?: boolean;
  /** Person at the table this line belongs to (prints on the cup label). */
  customer?: string;
}

/** A stored orden_items row, as returned by listarPendientes. */
export interface PendingOrderItem {
  id: string;
  kind: "item" | "combo";
  productoId: string | null;
  comboId: string | null;
  name: string;
  qty: number;
  unitPrice: number;
  mods: ModSelection;
  position: number;
  /** Person this line belongs to; "" when unassigned. */
  customer: string;
}

export type OrderStatus = "pendiente" | "pagada" | "cancelada";
export type PayMethodId = "efectivo" | "tarjeta" | "transferencia";

/** One payment on an order (several when the table pays per person). */
export interface OrderPayment {
  id: string;
  /** Person this payment was for; null = the table / unassigned lines. */
  customer: string | null;
  method: PayMethodId;
  amount: number;
  tendered: number | null;
  change: number;
  createdAt: string;
}
export type OrdersTab = OrderStatus | "todas";

/** A stored order as the register lists it (pending queue and history). */
export interface PosOrder {
  id: string;
  folio: string;
  status: OrderStatus;
  orderType: OrderType;
  total: number;
  sinGluten: boolean;
  note: string;
  /** Table / group label ("Mesa 3"); per-person names live on the lines. */
  customerName: string;
  /** Ordered roster of the table (the ticket's chips), may include people with no line yet. */
  customerNames: string[];
  createdAt: string;
  paidAt: string | null;
  /** Summary over the payments: the one method, or "mixto". */
  paymentMethod: PayMethodId | "mixto" | null;
  tendered: number | null;
  change: number;
  /** Sum of the payments so far (cached on the order). */
  paid: number;
  pagos: OrderPayment[];
  items: PendingOrderItem[];
}
/** An unpaid order the register can reopen, charge or cancel. */
export type PendingOrder = PosOrder;
