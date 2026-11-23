import type { OrderDescuento } from "./descuentos";
import type { BloqueVista } from "@/lib/recetas/capas";
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
  /** Preparation steps (productos.preparacion, one per line), empty when none. */
  prep: string[];
  /** Upsell line the barista says for this product (productos.recomendacion), null = none. */
  script: string | null;
  /** Ficha técnica por capas (productos.capas, 0087), null = only the text steps. */
  capas?: BloqueVista[] | null;
  /** How the finished drink looks (productos.referencia_visual). */
  visual?: string | null;
  /** Packaging kind of its category (0083): a «bebida» counts for the delivery bags. */
  empaque?: "bebida" | "comida" | null;
  /** Price with the «16 oz» option, null when the product has no 16 oz. */
  price16?: number | null;
}

/** "1. Muele…\n2. Extrae…" or plain lines → trimmed steps, numbering stripped. */
export function prepSteps(text: string | null | undefined): string[] {
  return (text ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:\d+[.)]|[-•*])\s*/, "").trim())
    .filter(Boolean);
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
  /**
   * What choosing it changes in the drink (modifier_option_receta): amounts
   * per unit, negative = takes that ingredient out (16 oz: +vaso 16, −vaso 12).
   * With `reemplaza`, it uses this ingredient in place of that one, in the
   * recipe's amount × qty (Deslactosada: leche deslactosada for the entera).
   */
  recipe?: Array<{ name: string; qty: number; unit: string; reemplaza?: string }>;
  /** How to prepare it (Cold foam de matcha), one step per line; the comanda prints it. */
  prep?: string;
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
  /** Best-selling product ids of the last 30 days, most sold first (Favoritos tab). */
  top: string[];
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
  /** Brand line art at the foot of the name label (organizations.label_art_url), null = none. */
  handArt: string | null;
  /** Customer names of past orders, most frequent first (autocomplete of «¿A nombre de quién?»). */
  nombres?: { nombre: string; veces: number }[];
  /** The team who can be on the bar (for «Barista: …»): staff with an active sede membership. */
  equipo: PosBarista[];
  /**
   * What sells together, from the orders of the last 30 days: product id →
   * the products most often on the same order, most frequent first.
   */
  pairs: Record<string, PosPair[]>;
  /** Shown on the payment pages when set (organizations columns). */
  pago: PosPagoInfo;
  /** Printed receipt header/footer (organizations.recibo_*). */
  recibo: PosReciboInfo;
}

/** Another product that shows up on the same orders as one product. */
export interface PosPair {
  id: string;
  /** Share (0–100) of the orders with the product that also had this one. */
  pct: number;
}

/** What the printed customer receipt carries besides the sale. */
export interface PosReciboInfo {
  /** Lines under the name: NIT, address, phone… */
  encabezado: string | null;
  pie: string | null;
  /** Brand name under the icon («Café Pa'Yo»); null = the org name. */
  nombre?: string | null;
  /** One-ink logo printed on top of the receipt (URL or site path). */
  logo?: string | null;
}

export interface PosPagoInfo {
  /** Bre-B key / account the customer transfers to. */
  transferenciaLlave: string | null;
  /** Account holder name. */
  transferenciaTitular: string | null;
  /** When datáfono money reaches the account, e.g. «1–2 días hábiles». */
  datafonoLiquidacion: string | null;
  /** The café's couriers (organizations.domiciliarios), for «Contactar domiciliario». */
  domiciliarios?: { nombre: string; numero: string }[];
}

/** A barista the register can credit a sale to (ordenes.barista_id). */
export interface PosBarista {
  id: string;
  name: string;
}

/** Catalog narrowed by the assistant to what the customer asked for. */
export interface PosCatalogFilter {
  label: string; // short description, e.g. "Bebidas frías" / "Sin gluten"
  ids: string[]; // matching product ids
  /** Lead-in of the strip over the grid; default «Lo que pidió el cliente:». */
  intro?: string;
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
/** How a payment was taken. «datafono» is record-only (Bold voucher, no integration). */
export type PayMethodId = "efectivo" | "transferencia" | "datafono";
/** An order's summary over its payments; «mixto» = paid in parts with several methods. */
export type PayMethodSummary = PayMethodId | "mixto";
export const PAY_METHOD_LABEL: Record<PayMethodSummary, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  datafono: "Datáfono",
  mixto: "Mixto",
};

/** One payment on an order (several when the table pays per person). */
export interface OrderPayment {
  id: string;
  /** Person this payment was for; null = the table / unassigned lines. */
  customer: string | null;
  method: PayMethodId;
  amount: number;
  tendered: number | null;
  change: number;
  /** Approval number from the datáfono voucher (optional). */
  approvalCode: string | null;
  createdAt: string;
}
/**
 * Pedidos tabs. «pendiente» = not completed yet: unpaid, or paid but not
 * handed over. «completada» = paid and delivered.
 */
export type OrdersTab = "pendiente" | "completada" | "cancelada" | "todas";

/** A stored order as the register lists it (pending queue and history). */
export interface PosOrder {
  id: string;
  folio: string;
  status: OrderStatus;
  orderType: OrderType;
  /** Where it was taken: at a station, or by the WhatsApp agent. Absent on orders still queued here. */
  canal?: "pos" | "whatsapp";
  total: number;
  sinGluten: boolean;
  note: string;
  /** Who the order is for (self-service: orders go by name, there are no tables). */
  customerName: string;
  /** Ordered roster of the order (the ticket's people chips), may include people with no line yet. */
  customerNames: string[];
  createdAt: string;
  paidAt: string | null;
  /** When the order reached the customer; null = still to deliver. */
  entregadaAt: string | null;
  /** «Ya está listo» on the Caja board; null = still being made. */
  listoAt?: string | null;
  /** Summary over the payments: the one method, or "mixto". */
  paymentMethod: PayMethodSummary | null;
  /** The barista brings it to the customer («Se lo llevamos»). */
  seLoLlevamos: boolean;
  /** «Aún no llega · pagar después»: sent before the transfer showed up. */
  porVerificar: "transferencia" | null;
  /** WhatsApp orders: waiting for the team to accept, accepted, or turned down (null for station orders). */
  waEstado?: WaEstado | null;
  /** Address for a WhatsApp delivery. */
  direccion?: string | null;
  /** WhatsApp delivery: the courier's fee the barista set when accepting (not part of total). */
  domicilioCop?: number | null;
  /** true = the customer added the fee to the transfer (pay the courier from the café); false = pays the courier; null = unknown yet. */
  domicilioTransferido?: boolean | null;
  /** The comanda was already printed by some register (WhatsApp orders). */
  comandaImpresa?: boolean;
  /** WhatsApp customer's number (E.164 digits), for the courier. */
  customerPhone?: string | null;
  /** Phone of whoever receives the delivery (may differ from the WhatsApp). */
  telefonoRecibe?: string | null;
  /** Who prepares it (ordenes.barista_id → catalog.equipo); null/absent = nobody credited. */
  baristaId?: string | null;
  tendered: number | null;
  change: number;
  /** Sum of the payments so far (cached on the order). */
  paid: number;
  pagos: OrderPayment[];
  items: PendingOrderItem[];
  /** Set when this order was folded into another one (it is then cancelada). */
  mergedInto: string | null;
  mergedIntoFolio: string | null;
  /** Only on orders still in this register's queue (not on the server yet). */
  local?: "sending" | "offline" | "failed";
  /** Discount requests of a pending order (mig 0085): waiting, approved or rejected. */
  descuentos?: OrderDescuento[];
}
/** An unpaid order the register can reopen, charge or cancel. */
export type PendingOrder = PosOrder;

/**
 * Why a pending order was voided — chips on the POS «Cancelar» sheet. The
 * reason is prepended to `ordenes.notes` (no schema change) so the 16 % of
 * cancelled orders can be read by cause.
 */
export const CANCEL_REASONS = ["Duplicado", "Error al tomar", "Cliente se fue", "Se acabó el producto", "Otro"] as const;

/** Why a WhatsApp order can't be made; the agent explains it to the customer (mig 0097). */
export const MOTIVOS_RECHAZO_WA = ["Faltan insumos", "Problema técnico", "Mucha demanda", "Otro"] as const;
export type MotivoRechazoWa = (typeof MOTIVOS_RECHAZO_WA)[number];
/**
 * A WhatsApp order through the team (mig 0098): por_aceptar → (barista)
 * esperando_pago [delivery] | en_preparacion [pick-up] → (admin approves the
 * payment) en_preparacion → («Salió») en_camino; or rechazado. «aceptado» is
 * only on orders from before this flow.
 */
export type WaEstado = "por_aceptar" | "aceptado" | "esperando_pago" | "en_preparacion" | "listo" | "en_camino" | "rechazado";
export type CancelReason = (typeof CANCEL_REASONS)[number];
