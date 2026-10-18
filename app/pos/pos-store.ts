"use client";

/**
 * POS state + logic (framework-agnostic store, cart math, live assistant,
 * cloud speech-to-text). The terminal UI in pos-terminal.tsx only renders
 * this; keeping the two apart makes the Square-style screen a pure view.
 *
 * Wiring:
 *  · Catalog — productos / combos / modificadores fetched server-side and
 *    handed in as `catalog` (see lib/pos/catalog.ts).
 *  · Orders — "Cobrar" persists through the crearOrden server action with the
 *    tender (efectivo / tarjeta / transferencia) and shows the real folio.
 *  · Assistant — the cashier's microphone (MediaRecorder → Groq Whisper via the
 *    transcribeAudio server action) feeds a transcript; debounced calls to the
 *    posSuggest server action ask Claude for suggestions whose actions reference
 *    live catalog ids. A typed fallback input is always available.
 */

import * as React from "react";
import {
  FAV_CAT,
  type PosCatalog,
  type PosMenuItem,
  type PosSuggest,
  type PosAct,
  type PosCatalogFilter,
  type ModSelection,
  type OrderLine,
  type PendingOrder,
  type PosOrder,
  type OrdersTab,
  type OrderPayment,
  type PendingOrderItem,
  type PayMethodId,
} from "@/lib/pos/types";
import { splitByPerson, shareStatus, summarizeMethod, type PersonShare } from "@/lib/pos/pagos";
import { defaultMergeTarget } from "@/lib/pos/combinar";
import { bogotaDay, defaultMods, linesPayload, normalizePerson, rebuildLines, rebuildPeople } from "@/lib/pos/pending";
import { findMergeIndex } from "@/lib/pos/cart";
import { planSaleLabels, type SaleLabelJob } from "@/lib/pos/drink-label";
import { fraseRespaldo } from "@/lib/pos/frase";
import {
  cancelarPendiente,
  cobrarPendiente,
  contarPorEntregar,
  marcarEntrega,
  crearOrden,
  generarFrase,
  registrarCalificaciones,
  guardarPendiente,
  listarOrdenes,
  listarPendientes,
  registrarPago,
  combinarPendientes,
  posSuggest,
  transcribeAudio,
} from "./actions";
import { nudge } from "./pos-live";
import { printOrderLabel, printMessageLabel, printDrinkLabel, printCalificaLabel } from "@/lib/printer/serial";
import { nuevoCodigo, urlCalificacion } from "@/lib/calificaciones/calificaciones";

// ── catalog context (stable, SSR-correct — no flash) ────────────
export const EMPTY_CATALOG: PosCatalog = {
  cats: [],
  menu: [],
  combos: [],
  modGroups: {},
  byId: {},
  comboById: {},
  catLabel: {},
  orgName: "comanda",
  instagram: null,
  sticker: null,
  cupArt: null,
  handArt: null,
};
export const CatalogCtx = React.createContext<PosCatalog>(EMPTY_CATALOG);
export const StationCtx = React.createContext<string>("Caja 01");
export const useCatalog = () => React.useContext(CatalogCtx);

// ── store ───────────────────────────────────────────────────────
export type { ModSelection, OrderLine } from "@/lib/pos/types";
// The suggestions array holds only the currently-open cards — each refresh
// replaces it (no indefinite stacking). Dismissed/accepted titles live in
// handledKeys so they don't pop back.
export type SuggestionCardState = PosSuggest & { uid: string };
export interface TranscriptLine {
  who: string;
  text: string;
  time: string;
}
export interface PosState {
  order: OrderLine[];
  orderType: "aqui" | "llevar" | "domicilio";
  cat: string;
  highlightId: string | null;
  catSource: "manual" | "ia";
  /** Catalog narrowed by the assistant to what the customer asked for. */
  catalogFilter: PosCatalogFilter | null;
  listening: boolean;
  thinking: boolean;
  micNote: string | null;
  /** Live (not-yet-final) speech being recognized, shown under the transcript. */
  interim: string;
  transcript: TranscriptLine[];
  suggestions: SuggestionCardState[];
  /** Titles the cashier dismissed/accepted — suppressed on future refreshes. */
  handledKeys: string[];
  flags: string[];
  noteSinGluten: boolean;
  loyalty: boolean;
  sending: boolean;
  sendError: string | null;
  sent: boolean;
  orderNo: string;
  /** Set once on mount so imperative actions can read the catalog. */
  catalog: PosCatalog;

  // ── Square-style screen state ──
  /** sale = catalog + ticket · tender = choose payment · done = receipt · ordenes = Pedidos (queue + history). */
  view: "sale" | "tender" | "done" | "ordenes" | "etiquetas";
  /** Item sheet (modifiers / qty) — add a new product or edit a ticket line. */
  sheet: { mode: "add"; productId: string } | { mode: "edit"; idx: number } | { mode: "receta"; productId: string } | null;
  /** Free-text search over the catalog (name / sku / description). */
  search: string;
  /** Assistant drawer open? */
  aiOpen: boolean;
  /**
   * Narrow screens only (tablet in portrait): the ticket is a panel that
   * slides over the catalog from the bar at the bottom. Ignored when the
   * ticket has its own column.
   */
  ticketOpen: boolean;
  /** Table / group label ("Mesa 3"); the people are in `people`. */
  customerName: string;
  /** The table's roster, in chip order. May hold someone with no line yet. */
  people: string[];
  /** Chip that new lines are assigned to. null = "sin nombre". */
  activePerson: string | null;
  note: string;
  payMethod: PayMethod;
  /** Cash received (efectivo only). null = not entered yet. */
  tendered: number | null;
  /** Change handed back on the last completed sale (receipt screen). */
  lastChange: number;
  lastTotal: number;
  /** Method summary of the last completed sale ("mixto" when paid in parts). */
  lastMethod: PayMethodId | "mixto";

  // ── pending orders ("enviar · pagar después") ──
  /**
   * The stored order the ticket is working on: `edit` = its lines are loaded
   * for changes, `charge` = loaded only to be paid (stored total is charged).
   */
  pending: {
    id: string;
    folio: string;
    total: number;
    mode: "edit" | "charge";
    /** Stored payments so far (charge mode drives the split from these). */
    paid: number;
    pagos: OrderPayment[];
    items: PendingOrderItem[];
    people: string[];
  } | null;
  /** Tender screen in per-person mode (only meaningful while charging a pendiente). */
  split: boolean;
  /** What the split tender is charging right now; null = nothing picked yet. */
  splitTarget: SplitTarget | null;
  pendientes: PendingOrder[];
  pendientesLoading: boolean;
  /** Today's live orders not handed over yet (the Pedidos badge). */
  porEntregar: number;
  pendientesError: string | null;
  // ── Pedidos view (Square-style cards: open queue + per-day history) ──
  ordenesTab: OrdersTab;
  /** Bogotá day shown on the history tabs (YYYY-MM-DD). */
  ordenesDay: string;
  ordenes: PosOrder[];
  ordenesLoading: boolean;
  ordenesError: string | null;
  /** Card selected in the Pedidos view (detail panel). */
  ordenSel: string | null;
  /** Combining pending orders: pick two or more, confirm, fold them into the target. */
  merge: { on: boolean; sel: string[]; target: string | null; targetChosen: boolean; confirming: boolean; busy: boolean; error: string | null };
  /** What the receipt screen describes: a paid sale or an order sent unpaid. */
  receiptKind: "pagada" | "pendiente";
  /** New orders on their way to the server; the register never waits on them. */
  outbox: OutboxItem[];
  /** The outbox job the receipt screen is showing, until it lands. */
  receiptJobId: string | null;
  /** Whether the server answers right now (false = selling offline, orders queue up). */
  online: boolean;
  /** AI "frase del día" label: last generated text + request state. */
  frase: string | null;
  fraseLoading: boolean;
  fraseError: string | null;
}

export type PayMethod = "efectivo" | "tarjeta" | "transferencia";
export const PAY_METHODS: { id: PayMethod; label: string; hint: string }[] = [
  { id: "efectivo", label: "Efectivo", hint: "Calcula el cambio" },
  { id: "tarjeta", label: "Tarjeta", hint: "Datáfono" },
  { id: "transferencia", label: "Transferencia", hint: "Nequi · Daviplata · QR" },
];

export const POS_INITIAL: PosState = {
  order: [],
  orderType: "aqui",
  cat: FAV_CAT,
  highlightId: null,
  catSource: "manual",
  catalogFilter: null,
  listening: false,
  thinking: false,
  micNote: null,
  interim: "",
  transcript: [],
  suggestions: [],
  handledKeys: [],
  flags: [],
  noteSinGluten: false,
  loyalty: false,
  sending: false,
  sendError: null,
  sent: false,
  orderNo: "Nuevo",
  catalog: EMPTY_CATALOG,
  view: "sale",
  sheet: null,
  search: "",
  aiOpen: false,
  ticketOpen: false,
  customerName: "",
  people: [],
  activePerson: null,
  note: "",
  payMethod: "efectivo",
  tendered: null,
  lastChange: 0,
  lastTotal: 0,
  lastMethod: "efectivo",
  pending: null,
  split: false,
  splitTarget: null,
  pendientes: [],
  pendientesLoading: false,
  porEntregar: 0,
  pendientesError: null,
  ordenesTab: "pendiente",
  ordenesDay: bogotaDay(),
  ordenes: [],
  ordenesLoading: false,
  ordenesError: null,
  ordenSel: null,
  merge: { on: false, sel: [], target: null, targetChosen: false, confirming: false, busy: false, error: null },
  receiptKind: "pagada",
  outbox: [],
  receiptJobId: null,
  online: true,
  frase: null,
  fraseLoading: false,
  fraseError: null,
};

type StateUpdater = Partial<PosState> | ((s: PosState) => PosState);
export const posStore = (() => {
  let state: PosState = { ...POS_INITIAL };
  const subs = new Set<() => void>();
  return {
    get: () => state,
    set: (u: StateUpdater) => {
      state = typeof u === "function" ? u(state) : { ...state, ...u };
      subs.forEach((f) => f());
    },
    sub: (f: () => void) => {
      subs.add(f);
      return () => {
        subs.delete(f);
      };
    },
  };
})();

export function usePos(): PosState {
  return React.useSyncExternalStore(posStore.sub, posStore.get, () => POS_INITIAL);
}

const fmtTime = (): string => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

// ── order helpers (pure; catalog passed in) ─────────────────────
export const posDefaultMods = defaultMods;
export function posMakeLine(p: PosMenuItem, catalog: PosCatalog): OrderLine {
  return {
    id: p.id,
    name: p.name,
    basePrice: p.price,
    qty: 1,
    gluten: p.gluten,
    kind: "item",
    mods: posDefaultMods(p, catalog),
    hasMods: p.mods.length > 0,
    expanded: false,
  };
}
export function modLinePrice(line: OrderLine, catalog: PosCatalog): number {
  if (line.kind === "combo") return line.price ?? 0;
  let extra = 0;
  if (line.mods) {
    for (const gid in line.mods) {
      const g = catalog.modGroups[gid];
      if (!g) continue;
      const sel = line.mods[gid];
      const names = Array.isArray(sel) ? sel : sel ? [sel] : [];
      names.forEach((n) => {
        const o = g.options.find((o) => o.name === n);
        if (o) extra += o.delta;
      });
    }
  }
  return (line.basePrice != null ? line.basePrice : line.price ?? 0) + extra;
}
export interface ModChip {
  name: string;
  delta: number;
  group: string;
}
export function modSummary(line: OrderLine, catalog: PosCatalog): ModChip[] {
  const out: ModChip[] = [];
  if (!line.mods) return out;
  for (const gid in line.mods) {
    const g = catalog.modGroups[gid];
    if (!g) continue;
    const sel = line.mods[gid];
    const names = Array.isArray(sel) ? sel : sel ? [sel] : [];
    names.forEach((n) => {
      const o = g.options.find((o) => o.name === n);
      if (!o) return;
      out.push({ name: n, delta: o.delta, group: gid });
    });
  }
  return out;
}
export const orderTotal = (order: OrderLine[], catalog: PosCatalog): number =>
  order.reduce((s, l) => s + modLinePrice(l, catalog) * l.qty, 0);

// ── imperative cart actions (read catalog from the store) ───────
/**
 * Tap on a product tile. Items with modifier groups open the item sheet so the
 * cashier picks size/milk/etc. first (Square behaviour); plain items go
 * straight into the ticket, merging with an identical line.
 */
/** Long-press on a tile: show the recipe (with the product photo) without touching the ticket. */
export function showRecipe(id: string) {
  if (!posStore.get().catalog.byId[id]) return;
  posStore.set({ sheet: { mode: "receta", productId: id } });
}
export function tapItem(id: string) {
  const p = posStore.get().catalog.byId[id];
  if (!p) return;
  if (p.mods.length > 0) posStore.set({ sheet: { mode: "add", productId: id } });
  else addItem(id);
}

/** A fresh line stamped with the active person (when there is one). */
function makeLineFor(p: PosMenuItem, s: PosState): OrderLine {
  const line = posMakeLine(p, s.catalog);
  return s.activePerson ? { ...line, customer: s.activePerson } : line;
}

/** Add a product with its default modifiers (used by the assistant + tapItem). */
export function addItem(id: string) {
  posStore.set((s) => {
    const p = s.catalog.byId[id];
    if (!p) return s;
    const hasMods = p.mods.length > 0;
    const line = makeLineFor(p, s);
    // Merge only with a twin of the same person — see findMergeIndex.
    const i = hasMods ? -1 : findMergeIndex(s.order, { id, kind: "item", mods: line.mods, customer: s.activePerson });
    let order: OrderLine[];
    if (i >= 0) order = s.order.map((l, k) => (k === i ? { ...l, qty: l.qty + 1 } : l));
    else order = [...s.order, line];
    return { ...s, order, sent: false, highlightId: s.highlightId === id ? null : s.highlightId };
  });
}
export function addCombo(comboId: string) {
  posStore.set((s) => {
    const c = s.catalog.comboById[comboId];
    if (!c) return s;
    const who = s.activePerson ? { customer: s.activePerson } : {};
    return {
      ...s,
      order: [...s.order, { id: c.id, name: c.name, price: c.price, qty: 1, kind: "combo", items: c.items, ...who }],
      sent: false,
      highlightId: s.highlightId === comboId ? null : s.highlightId,
    };
  });
}
export function swapCombo(removeId: string, comboId: string) {
  posStore.set((s) => {
    const c = s.catalog.comboById[comboId];
    if (!c) return s;
    let removed = false;
    // The combo takes over the swapped line's person (the swap is about that line).
    let who: { customer?: string } = {};
    const order = s.order.filter((l) => {
      if (!removed && l.kind === "item" && l.id === removeId) {
        if (l.customer) who = { customer: l.customer };
        if (l.qty > 1) {
          l.qty -= 1;
          return true;
        }
        removed = true;
        return false;
      }
      return true;
    });
    return {
      ...s,
      order: [...order, { id: c.id, name: c.name, price: c.price, qty: 1, kind: "combo", items: c.items, ...who }],
      sent: false,
      highlightId: s.highlightId === comboId ? null : s.highlightId,
    };
  });
}
/**
 * Commit the item sheet: a fully-specified line (mods + qty). `customer`
 * defaults to the active chip; the sheet passes its own pick when the
 * cashier changed it there. Merges only with a twin of the same person.
 */
export function addLineWithMods(productId: string, mods: ModSelection, qty: number, customer?: string | null) {
  posStore.set((s) => {
    const p = s.catalog.byId[productId];
    if (!p) return s;
    const who = customer === undefined ? s.activePerson : customer;
    const line: OrderLine = { ...posMakeLine(p, s.catalog), mods, qty: Math.max(1, qty), ...(who ? { customer: who } : {}) };
    const i = findMergeIndex(s.order, { id: productId, kind: "item", mods, customer: who });
    const order = i >= 0 ? s.order.map((l, k) => (k === i ? { ...l, qty: l.qty + line.qty } : l)) : [...s.order, line];
    return { ...s, order, sent: false, sheet: null, highlightId: s.highlightId === productId ? null : s.highlightId };
  });
}
/** Edit a line in place. Never merges into a twin (that would change a qty under the cashier's finger). */
export function replaceLine(idx: number, mods: ModSelection, qty: number, customer?: string | null) {
  posStore.set((s) => ({
    ...s,
    order: qty <= 0
      ? s.order.filter((_, k) => k !== idx)
      : s.order.map((l, k) => {
          if (k !== idx) return l;
          const next: OrderLine = { ...l, mods, qty };
          if (customer !== undefined) {
            if (customer) next.customer = customer;
            else delete next.customer;
          }
          return next;
        }),
    sent: false,
    sheet: null,
  }));
}
export function removeLine(idx: number) {
  posStore.set((s) => ({ ...s, order: s.order.filter((_, k) => k !== idx), sent: false, sheet: null }));
}
export function clearTicket() {
  posStore.set((s) => ({ ...s, order: [], customerName: "", people: [], activePerson: null, note: "", noteSinGluten: false, sent: false, sheet: null, view: "sale", tendered: null, ticketOpen: false }));
}

// ── people at the table ─────────────────────────────────────────
const samePerson = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();

export function setActivePerson(name: string | null) {
  posStore.set({ activePerson: name });
}
/**
 * Add a person to the table and make them active. A name already on the
 * roster (case-insensitive) just becomes active: two "Juan"s would be one
 * person on the labels anyway. Returns the roster spelling.
 */
export function addPerson(raw: string, opts: { activate?: boolean } = {}): string | null {
  const name = normalizePerson(raw);
  if (!name) return null;
  const activate = opts.activate ?? true;
  let out: string | null = null;
  posStore.set((s) => {
    const existing = s.people.find((p) => samePerson(p, name));
    out = existing ?? name;
    return { ...s, activePerson: activate ? out : s.activePerson, people: existing ? s.people : [...s.people, name] };
  });
  return out;
}
/**
 * The ticket's big name field: add the person and make them active. When
 * they're the first name on the ticket, whatever was already rung up without
 * a name becomes theirs — the barista often asks the name after the drinks.
 */
export function nameTicket(raw: string): string | null {
  const first = posStore.get().people.length === 0;
  const name = addPerson(raw);
  if (name && first) {
    posStore.set((s) => ({
      ...s,
      order: s.order.map((l) => (l.customer ? l : { ...l, customer: name })),
      sent: s.order.some((l) => !l.customer) ? false : s.sent,
    }));
  }
  return name;
}
/**
 * Rename a person everywhere (roster + their lines). Renaming onto another
 * roster entry merges the two — the intuitive fix for a typo.
 */
export function renamePerson(oldName: string, raw: string) {
  const next = normalizePerson(raw);
  if (!next || next === oldName) return;
  posStore.set((s) => {
    const other = s.people.find((p) => p !== oldName && samePerson(p, next));
    const final = other ?? next;
    const people = other
      ? s.people.filter((p) => p !== oldName)
      : s.people.map((p) => (p === oldName ? next : p));
    const order = s.order.map((l) => (l.customer === oldName ? { ...l, customer: final } : l));
    return { ...s, people, order, sent: false, activePerson: s.activePerson === oldName ? final : s.activePerson };
  });
}
/**
 * Take a person off the table. Their lines stay and become unassigned —
 * deleting drinks because a chip was tapped would be unrecoverable.
 */
export function removePerson(name: string) {
  posStore.set((s) => ({
    ...s,
    people: s.people.filter((p) => p !== name),
    order: s.order.map((l) => {
      if (l.customer !== name) return l;
      const rest = { ...l };
      delete rest.customer;
      return rest;
    }),
    sent: false,
    activePerson: s.activePerson === name ? null : s.activePerson,
  }));
}
/** Reassign one ticket line to a person (or to nobody). */
export function setLinePerson(idx: number, name: string | null) {
  posStore.set((s) => ({
    ...s,
    order: s.order.map((l, k) => {
      if (k !== idx) return l;
      const next = { ...l };
      if (name) next.customer = name;
      else delete next.customer;
      return next;
    }),
    sent: false,
  }));
}
/** Lines assigned to a person ("" / null = the unassigned ones). */
export function linesOf(order: ReadonlyArray<OrderLine>, name: string | null): number {
  return order.reduce((n, l) => n + ((l.customer ?? "") === (name ?? "") ? l.qty : 0), 0);
}

export function changeQty(idx: number, d: number) {
  posStore.set((s) => {
    const order = s.order
      .map((l, k) => (k === idx ? { ...l, qty: l.qty + d } : l))
      .filter((l) => l.qty > 0);
    return { ...s, order, sent: false };
  });
}
export function toggleLineExpanded(idx: number) {
  posStore.set((s) => ({
    ...s,
    order: s.order.map((l, k) => (k === idx ? { ...l, expanded: !l.expanded } : l)),
  }));
}
export function setLineSingle(idx: number, gid: string, name: string) {
  posStore.set((s) => ({
    ...s,
    order: s.order.map((l, k) => (k === idx ? { ...l, mods: { ...l.mods, [gid]: name } } : l)),
    sent: false,
  }));
}
export function toggleLineMulti(idx: number, gid: string, name: string) {
  posStore.set((s) => ({
    ...s,
    order: s.order.map((l, k) => {
      if (k !== idx) return l;
      const cur = l.mods?.[gid];
      const arr = Array.isArray(cur) ? cur : [];
      const has = arr.includes(name);
      return { ...l, mods: { ...l.mods, [gid]: has ? arr.filter((x) => x !== name) : [...arr, name] } };
    }),
    sent: false,
  }));
}
export function applyModsToLine(productId: string, set: Record<string, string | string[]>) {
  posStore.set((s) => {
    let order = [...s.order];
    let idx = order.findIndex((l) => l.kind === "item" && l.id === productId);
    if (idx < 0) {
      const p = s.catalog.byId[productId];
      if (!p) return s;
      order = [...order, posMakeLine(p, s.catalog)];
      idx = order.length - 1;
    }
    const line: OrderLine = { ...order[idx], mods: { ...order[idx].mods }, expanded: true };
    for (const gid in set) line.mods![gid] = set[gid];
    order[idx] = line;
    return { ...s, order, sent: false, highlightId: s.highlightId === productId ? null : s.highlightId };
  });
}

// ── AI suggestion actions ───────────────────────────────────────
export function applyAct(act?: PosAct) {
  if (!act) return;
  if (act.type === "add") addItem(act.id);
  else if (act.type === "combo") addCombo(act.id);
  else if (act.type === "swapCombo") swapCombo(act.removeId, act.comboId);
  else if (act.type === "mods") applyModsToLine(act.id, act.set);
  else if (act.type === "flag") posStore.set((s) => ({ ...s, noteSinGluten: true }));
  else if (act.type === "loyalty") posStore.set((s) => ({ ...s, loyalty: true }));
}
export function dismissSuggestion(uid: string, _accepted: boolean) {
  void _accepted;
  posStore.set((s) => {
    const card = s.suggestions.find((g) => g.uid === uid);
    return {
      ...s,
      suggestions: s.suggestions.filter((g) => g.uid !== uid),
      handledKeys: card && !s.handledKeys.includes(card.title)
        ? [...s.handledKeys, card.title]
        : s.handledKeys,
    };
  });
}

// ── live assistant: transcript + debounced suggestions ──────────
let suggestTimer: ReturnType<typeof setTimeout> | null = null;
let suggestSeq = 0;

export function appendTranscript(who: string, text: string) {
  posStore.set((s) => ({ ...s, transcript: [...s.transcript, { who, text, time: fmtTime() }] }));
  scheduleSuggest();
}
export function scheduleSuggest(delay = 350) {
  // Short debounce: VAD already cuts on a pause, so each transcript line is a
  // finished phrase — fire fast, just coalescing back-to-back segments.
  if (suggestTimer) clearTimeout(suggestTimer);
  suggestTimer = setTimeout(runSuggest, delay);
}
async function runSuggest() {
  const s = posStore.get();
  if (!s.transcript.length || s.sent) return;
  const seq = ++suggestSeq;
  posStore.set({ thinking: true });
  const cart = s.order.map((l) => ({
    name: l.name,
    qty: l.qty,
    mods: modSummary(l, s.catalog).map((m) => m.name),
  }));
  const res = await posSuggest({
    transcript: s.transcript.map((t) => ({ who: t.who, text: t.text })),
    cart,
    orderType: s.orderType,
    sinGluten: s.noteSinGluten,
  });
  if (seq !== suggestSeq) return; // a newer request superseded this one
  posStore.set((st) => {
    if (!res.ok) {
      return { ...st, thinking: false, micNote: res.missingKey ? res.error : st.micNote };
    }
    const handled = new Set(st.handledKeys);
    const fresh = res.suggestions
      .filter((g) => !handled.has(g.title))
      .map((g, i) => ({ ...g, uid: `sg${seq}_${i}` }));
    // Replace the open set with this turn's suggestions (no stacking). If the
    // model returned nothing this turn, keep what's already shown.
    const suggestions = res.suggestions.length ? fresh : st.suggestions;
    let cat = st.cat,
      highlightId = st.highlightId,
      catSource = st.catSource;
    const f = fresh.find((g) => g.focus);
    if (f?.focus) {
      if (f.focus.catId) {
        cat = f.focus.catId;
        catSource = "ia";
      }
      if ("highlightId" in f.focus) highlightId = f.focus.highlightId ?? null;
    }
    // Apply the assistant's catalog filter (replace on a new one; keep the
    // current one if this turn had none, so it doesn't flicker off).
    const catalogFilter = res.filter ?? st.catalogFilter;
    return {
      ...st,
      thinking: false,
      suggestions,
      cat,
      highlightId,
      catSource,
      catalogFilter,
    };
  });
}
/** Start a fresh sale: clears ticket + conversation, keeps mic/drawer/catalog. */
export function resetConversation() {
  posStore.set((s) => ({
    ...POS_INITIAL,
    catalog: s.catalog,
    listening: s.listening,
    aiOpen: s.aiOpen,
    cat: s.cat,
    pendientes: s.pendientes,
    ordenes: s.ordenes,
    ordenesTab: s.ordenesTab,
    ordenesDay: s.ordenesDay,
    outbox: s.outbox,
    online: s.online,
  }));
}

// ── outbox: new orders are sent in the background ───────────────
/**
 * A new order leaves the register the moment the cashier confirms it: the
 * receipt opens at once ("Registrando…"), the next ticket can start, and
 * the request runs behind. When it lands the receipt gets its folio and the
 * labels print; if it fails the job stays here, marked, until it is retried
 * or dropped. Persisted per tablet so a reload never loses a sale.
 *
 * Offline: when the server can't be reached the job waits ("offline") instead
 * of failing — its labels print right away with a provisional folio (L-n) and
 * it is sent on its own when the connection comes back. The job id travels as
 * `clientRef`, so a retry whose first answer was lost never doubles the order.
 */
export interface OutboxItem {
  id: string;
  kind: "pagada" | "pendiente";
  status: "sending" | "failed" | "offline";
  error: string | null;
  createdAt: number;
  base: {
    orderType: PosState["orderType"];
    sinGluten: boolean;
    lines: ReturnType<typeof linesPayload>;
    customerName?: string;
    customerNames?: string[];
    note?: string;
  };
  payment?: { method: PayMethodId; tendered: number | null };
  /** What the labels and the receipt need, frozen at confirm time. */
  snapshot: { order: OrderLine[]; people: string[]; customerName: string; total: number; change: number };
  /** Labels already printed offline: the provisional folio and the rating codes to register on landing. */
  printed?: { folio: string; enlaces: EnlaceVenta[] };
}
const OUTBOX_KEY = "pos:outbox";
function persistOutbox() {
  try {
    window.localStorage.setItem(OUTBOX_KEY, JSON.stringify(posStore.get().outbox));
  } catch { /* private mode */ }
}
/** Restore unsent orders from the last session and send them. */
export function hydrateOutbox() {
  try {
    const raw = window.localStorage.getItem(OUTBOX_KEY);
    if (!raw) return;
    const items = (JSON.parse(raw) as OutboxItem[]).map((j) => ({ ...j, status: "sending" as const, error: null }));
    if (!items.length) return;
    posStore.set((st) => ({ ...st, outbox: [...items, ...st.outbox] }));
    void runOutbox(true);
  } catch { /* ignore */ }
}

/** Server unreachable (thrown fetch, timeout) — as opposed to the server saying no. */
class OfflineError extends Error {}
const SEND_TIMEOUT_MS = 30_000;
/** A server action that gives up after a while; a hung request on a bad hotspot reads as offline. */
function withTimeout<T>(p: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new OfflineError("timeout")), SEND_TIMEOUT_MS);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(new OfflineError(String(e))); });
  });
}
const OFFLINE_MSG = "Sin conexión con el servidor.";
/** Await a server action without ever leaving the screen stuck: a network failure becomes an error result. */
async function safeAction<T>(p: Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await p;
  } catch {
    setOnline(false);
    return { ok: false, error: OFFLINE_MSG };
  }
}

function setOnline(online: boolean) {
  if (posStore.get().online === online) return;
  posStore.set({ online });
  // The server answered again: whatever waited goes out now.
  if (online) wakeOffline();
}

/** Provisional folio for labels printed offline: L-1, L-2… per Bogotá day. */
function offlineFolio(): string {
  const KEY = "pos:offline-folio";
  const day = bogotaDay();
  let n = 1;
  try {
    const prev = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as { day: string; n: number } | null;
    if (prev && prev.day === day) n = prev.n + 1;
    window.localStorage.setItem(KEY, JSON.stringify({ day, n }));
  } catch { /* private mode */ }
  return `L-${n}`;
}

let retryTimer: ReturnType<typeof setTimeout> | null = null;
/** Put waiting jobs back in line and send them (reconnect, timer, or the cashier). */
function wakeOffline() {
  if (!posStore.get().outbox.some((j) => j.status === "offline")) return;
  posStore.set((st) => ({ ...st, outbox: st.outbox.map((j) => (j.status === "offline" ? { ...j, status: "sending" } : j)) }));
  void runOutbox(true);
}
function scheduleOfflineRetry() {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    wakeOffline();
  }, 15_000);
}
let connectivityWired = false;
/** Follow the browser's connection state; a reconnect flushes the queue at once. */
export function watchConnectivity() {
  if (connectivityWired || typeof window === "undefined") return;
  connectivityWired = true;
  setOnline(navigator.onLine);
  window.addEventListener("online", () => {
    setOnline(true);
    wakeOffline();
    void refreshPendientes();
  });
  window.addEventListener("offline", () => setOnline(false));
}
function enqueueOutbox(job: OutboxItem) {
  posStore.set((st) => ({ ...st, outbox: [...st.outbox, job] }));
  persistOutbox();
  void runOutbox();
}
let outboxRunning = false;
/**
 * Send queued orders in order. While the server is known to be unreachable a
 * new order skips the network (its labels must print now, not after a 30 s
 * timeout); `probe` lets the first job try anyway to find out if it is back.
 */
export async function runOutbox(probe = false) {
  if (outboxRunning) return;
  outboxRunning = true;
  let tryNetwork = probe || posStore.get().online;
  try {
    for (;;) {
      const job = posStore.get().outbox.find((j) => j.status === "sending");
      if (!job) break;
      let res: Awaited<ReturnType<typeof crearOrden>> | Awaited<ReturnType<typeof guardarPendiente>>;
      const ref = { clientRef: job.id, createdAt: job.createdAt };
      try {
        if (!tryNetwork || (typeof navigator !== "undefined" && !navigator.onLine)) throw new OfflineError("offline");
        res = await withTimeout(job.kind === "pagada"
          ? crearOrden({ ...job.base, ...ref, payment: job.payment })
          : guardarPendiente({ ...job.base, ...ref }));
      } catch {
        // No server: the sale is safe in the queue. Print its labels now so
        // the bar keeps working, and send it when the connection is back.
        setOnline(false);
        tryNetwork = false;
        let printed = job.printed;
        if (!printed) {
          const folio = offlineFolio();
          printed = { folio, enlaces: printSaleLabels({ ...job.snapshot, catalog: posStore.get().catalog }, folio, null) };
        }
        posStore.set((st) => ({
          ...st,
          outbox: st.outbox.map((j) => (j.id === job.id ? { ...j, status: "offline", error: OFFLINE_MSG, printed } : j)),
          ...(st.receiptJobId === job.id ? { orderNo: printed.folio } : {}),
        }));
        persistOutbox();
        scheduleOfflineRetry();
        continue;
      }
      setOnline(true);
      if (res.ok) {
        const folio = res.folio;
        const change = Number((res as { change?: number }).change ?? 0);
        posStore.set((st) => ({
          ...st,
          outbox: st.outbox.filter((j) => j.id !== job.id),
          ...(st.receiptJobId === job.id ? { orderNo: folio, sent: true, lastChange: change, lastTotal: res.total, receiptJobId: null } : {}),
        }));
        if (job.printed) {
          if (job.printed.enlaces.length) void registrarEnlacesVenta(res.ordenId, job.printed.enlaces);
        } else printSaleLabels({ ...job.snapshot, catalog: posStore.get().catalog }, folio, res.ordenId);
        void refreshPendientes();
        if (posStore.get().view === "ordenes") void refreshOrdenes();
        nudge("ordenes");
      } else {
        const error = res.error;
        posStore.set((st) => ({ ...st, outbox: st.outbox.map((j) => (j.id === job.id ? { ...j, status: "failed", error } : j)) }));
      }
      persistOutbox();
    }
  } finally {
    outboxRunning = false;
    persistOutbox();
  }
}
export function retryOutbox(id?: string) {
  posStore.set((st) => ({ ...st, outbox: st.outbox.map((j) => (j.status !== "sending" && (!id || j.id === id) ? { ...j, status: "sending", error: null } : j)) }));
  persistOutbox();
  void runOutbox(true);
}
/** Drop a failed order for good (the cashier decided it is not coming back). */
export function dropOutbox(id: string) {
  posStore.set((st) => ({ ...st, outbox: st.outbox.filter((j) => j.id !== id), receiptJobId: st.receiptJobId === id ? null : st.receiptJobId }));
  persistOutbox();
}
/** Id of a queued order shown in Pedidos: the outbox job id behind a prefix. */
export const LOCAL_ORDER = "local:";
const jobIdOf = (ordenId: string) => (ordenId.startsWith(LOCAL_ORDER) ? ordenId.slice(LOCAL_ORDER.length) : null);

/**
 * The orders still in this register's queue, shaped like stored ones so the
 * Pedidos view can list them next to what the server returned — offline a
 * sale must not vanish from the screen until it syncs.
 */
export function queuedOrders(s: Pick<PosState, "outbox" | "catalog">): PosOrder[] {
  return s.outbox.map((j) => {
    const createdAt = new Date(j.createdAt).toISOString();
    const items = j.snapshot.order.map((l, i) => ({
      id: `${j.id}-${i}`,
      kind: l.kind,
      productoId: l.kind === "item" ? l.id : null,
      comboId: l.kind === "combo" ? l.id : null,
      name: l.name,
      qty: l.qty,
      unitPrice: modLinePrice(l, s.catalog),
      mods: l.mods ?? {},
      position: i,
      customer: l.customer ?? "",
    }));
    const pagada = j.kind === "pagada";
    return {
      id: LOCAL_ORDER + j.id,
      folio: j.printed?.folio ?? "…",
      status: j.kind,
      orderType: j.base.orderType,
      total: j.snapshot.total,
      sinGluten: j.base.sinGluten,
      note: j.base.note ?? "",
      customerName: j.base.customerName ?? "",
      customerNames: j.base.customerNames ?? [],
      createdAt,
      paidAt: pagada ? createdAt : null,
      entregadaAt: null,
      paymentMethod: pagada ? j.payment?.method ?? null : null,
      tendered: pagada ? j.payment?.tendered ?? null : null,
      change: pagada ? j.snapshot.change : 0,
      paid: 0,
      pagos: [],
      items,
      mergedInto: null,
      mergedIntoFolio: null,
      local: j.status,
    };
  });
}

function newJobId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Go to the tender screen (Square "Charge"). */
export function startTender() {
  const s = posStore.get();
  if (!s.order.length) return;
  posStore.set({ view: "tender", tendered: null, sendError: null, sheet: null });
}
export function cancelTender() {
  const s = posStore.get();
  if (s.pending?.mode === "charge") {
    // The ticket only held the order for the summary — drop it and go back to Pedidos.
    resetConversation();
    openOrdenes();
    return;
  }
  posStore.set({ view: "sale", tendered: null, sendError: null });
}

/** Amount the tender screen charges: what is still owed on a pending order, else the ticket. */
export function ticketTotal(s: PosState): number {
  return s.pending?.mode === "charge" ? Math.max(0, s.pending.total - s.pending.paid) : orderTotal(s.order, s.catalog);
}

// ── paying in parts ─────────────────────────────────────────────
export type SplitTarget = { kind: "share"; customer: string | null } | { kind: "rest" };

/** A stored order's bill split by person. */
export function orderShares(o: Pick<PosOrder, "items" | "customerNames">): PersonShare[] {
  return splitByPerson(
    o.items.map((it) => ({ name: it.name, qty: it.qty, unitPrice: it.unitPrice, customer: it.customer })),
    rebuildPeople(o),
  );
}
/** The bill split by person: stored lines when charging a pendiente, live lines otherwise. */
export function ticketShares(s: PosState): PersonShare[] {
  if (s.pending?.mode === "charge") {
    return splitByPerson(
      s.pending.items.map((it) => ({ name: it.name, qty: it.qty, unitPrice: it.unitPrice, customer: it.customer })),
      s.pending.people,
    );
  }
  return splitByPerson(
    s.order.map((l) => ({ name: l.name, qty: l.qty, unitPrice: modLinePrice(l, s.catalog), customer: l.customer ?? "" })),
    s.people,
  );
}
/** What the tender charges right now: one share, the rest, or the whole ticket. */
export function tenderAmount(s: PosState): number {
  if (s.pending?.mode === "charge" && s.split && s.splitTarget) {
    if (s.splitTarget.kind === "rest") return ticketTotal(s);
    const who = s.splitTarget.customer;
    const share = ticketShares(s).find((sh) => sh.customer === who);
    if (!share) return 0;
    return Math.max(0, share.amount - shareStatus(share, s.pending.pagos, false).paid);
  }
  return ticketTotal(s);
}
export function pickShare(target: SplitTarget | null) {
  posStore.set({ splitTarget: target, tendered: null, sendError: null });
}
export function stopSplit() {
  posStore.set({ split: false, splitTarget: null, tendered: null, sendError: null });
}
/**
 * Switch the tender to per-person mode. Splitting always works on a stored
 * order: a fresh ticket is saved as pendiente first (its labels print on
 * that first send) and then reopened for charging.
 */
export async function startSplit() {
  const s = posStore.get();
  if (s.sending) return;
  if (s.pending?.mode === "charge") {
    posStore.set({ split: true, splitTarget: null, tendered: null, sendError: null });
    return;
  }
  const res = await persistPending();
  if (!res.ok) return;
  // Fetch the stored order directly: refreshPendientes is single-flight and
  // persistPending just kicked one off, so awaiting it would return at once.
  const list = await safeAction(listarPendientes());
  const o = list.ok ? list.orders.find((x) => x.id === res.ordenId) : undefined;
  if (!o) {
    posStore.set({ sendError: "El pedido se guardó, pero no se pudo abrir para cobrar. Búscalo en Pedidos." });
    return;
  }
  loadPending(o, "charge");
  posStore.set({ view: "tender", split: true, splitTarget: null, tendered: null, payMethod: "efectivo", sendError: null });
}
/** Take the selected share (or the rest) with the chosen method. */
export async function paySplit() {
  const s = posStore.get();
  if (!s.pending || s.pending.mode !== "charge" || !s.splitTarget || s.sending) return;
  const amount = tenderAmount(s);
  if (amount <= 0) return;
  const tendered = s.payMethod === "efectivo" ? s.tendered ?? amount : null;
  if (tendered !== null && tendered < amount) {
    posStore.set({ sendError: "El efectivo recibido es menor que el monto." });
    return;
  }
  posStore.set({ sending: true, sendError: null });
  const target = s.splitTarget;
  const res = await safeAction(registrarPago({
    ordenId: s.pending.id,
    customerName: target.kind === "share" ? target.customer : null,
    payment: { method: s.payMethod, tendered },
    amount: target.kind === "share" ? amount : undefined,
  }));
  if (!res.ok) {
    posStore.set({ sending: false, sendError: res.error });
    return;
  }
  if (res.status === "pagada") {
    posStore.set({
      sending: false,
      sent: true,
      orderNo: res.folio,
      view: "done",
      receiptKind: "pagada",
      lastTotal: res.total,
      lastChange: res.change,
      lastMethod: summarizeMethod(res.pagos.map((p) => p.method)) ?? s.payMethod,
      split: false,
      splitTarget: null,
    });
  } else {
    posStore.set((st) => ({
      ...st,
      sending: false,
      splitTarget: null,
      tendered: null,
      pending: st.pending ? { ...st.pending, paid: res.paid, pagos: res.pagos } : st.pending,
    }));
  }
  void refreshPendientes();
  nudge("ordenes");
}

/**
 * Persist the sale with its tender. Cash requires `tendered >= total`; the
 * server recomputes prices and the change, we only echo it on the receipt.
 * When a pending order is loaded, edits are saved first and then the stored
 * order is charged (cobrarPendiente) instead of creating a new one.
 */
export async function completeSale() {
  const s = posStore.get();
  if (!s.order.length || s.sending) return;
  if (s.order.some((l) => l.missing)) {
    posStore.set({ sendError: "Quita el producto no disponible para continuar." });
    return;
  }
  const total = ticketTotal(s);
  const tendered = s.payMethod === "efectivo" ? s.tendered ?? total : null;
  if (s.payMethod === "efectivo" && tendered !== null && tendered < total) {
    posStore.set({ sendError: "El efectivo recibido es menor que el total." });
    return;
  }
  posStore.set({ sending: true, sendError: null });
  const base = {
    orderType: s.orderType,
    sinGluten: s.noteSinGluten,
    lines: linesPayload(s.order),
    customerName: s.customerName.trim() || undefined,
    customerNames: s.people.length ? s.people : undefined,
    note: s.note.trim() || undefined,
  };
  const payment = { method: s.payMethod, tendered };

  const queuedId = s.pending ? jobIdOf(s.pending.id) : null;
  if (queuedId) {
    // A «pagar después» order that never reached the server: charging it just
    // turns its queued job into a paid sale (no new labels — they printed).
    const job = s.outbox.find((j) => j.id === queuedId);
    if (!job || job.status === "sending") {
      posStore.set({ sending: false, sendError: job ? "El pedido se está enviando; intenta en un momento." : "El pedido ya no está en la cola." });
      return;
    }
    const change = tendered !== null ? tendered - total : 0;
    posStore.set((st) => ({
      ...st,
      outbox: st.outbox.map((j) => (j.id === queuedId
        ? { ...j, kind: "pagada" as const, payment, status: "sending" as const, error: null, snapshot: { ...j.snapshot, change } }
        : j)),
      sending: false, sent: false, orderNo: job.printed?.folio ?? "…", view: "done", receiptKind: "pagada",
      lastTotal: total, lastChange: change, lastMethod: s.payMethod, receiptJobId: queuedId,
    }));
    persistOutbox();
    void runOutbox();
    return;
  }

  if (!s.pending) {
    // A new sale: hand it to the outbox and open the receipt right away.
    const change = tendered !== null ? tendered - total : 0;
    const job: OutboxItem = {
      id: newJobId(), kind: "pagada", status: "sending", error: null, createdAt: Date.now(),
      base, payment, snapshot: { order: s.order, people: s.people, customerName: s.customerName, total, change },
    };
    posStore.set({
      sending: false, sent: false, orderNo: "…", view: "done", receiptKind: "pagada",
      lastTotal: total, lastChange: change, lastMethod: s.payMethod, receiptJobId: job.id,
    });
    enqueueOutbox(job);
    return;
  }
  let res: Awaited<ReturnType<typeof crearOrden>>;
  if (s.pending) {
    if (s.pending.mode === "edit") {
      const saved = await safeAction(guardarPendiente({ ...base, ordenId: s.pending.id }));
      if (!saved.ok) {
        posStore.set({ sending: false, sendError: saved.error });
        return;
      }
      // Cash was validated against the client total; re-check against the saved one.
      if (tendered !== null && tendered < saved.total) {
        posStore.set({ sending: false, sendError: "El efectivo recibido es menor que el total." });
        return;
      }
    }
    res = await safeAction(cobrarPendiente({ ordenId: s.pending.id, payment }));
  } else {
    res = await safeAction(crearOrden({ ...base, payment }));
  }

  if (res.ok) {
    posStore.set({
      sent: true,
      sending: false,
      orderNo: res.folio,
      view: "done",
      lastChange: res.change,
      lastTotal: res.total,
      lastMethod: s.payMethod,
      receiptKind: "pagada",
    });
    // A pending order already got its labels when it was sent.
    void refreshPendientes();
    nudge("ordenes");
  } else posStore.set({ sending: false, sendError: res.error });
}

/**
 * "Enviar · pagar después": persist the ticket as a pending order (or re-save
 * the pending order being edited) and free the register. The kitchen label
 * prints on the first send only.
 */
export async function savePending() {
  const s = posStore.get();
  if (!s.pending) {
    if (!s.order.length || s.sending) return;
    if (s.order.some((l) => l.missing)) {
      posStore.set({ sendError: "Quita el producto no disponible para continuar." });
      return;
    }
    const total = orderTotal(s.order, s.catalog);
    const job: OutboxItem = {
      id: newJobId(), kind: "pendiente", status: "sending", error: null, createdAt: Date.now(),
      base: {
        orderType: s.orderType,
        sinGluten: s.noteSinGluten,
        lines: linesPayload(s.order),
        customerName: s.customerName.trim() || undefined,
        customerNames: s.people.length ? s.people : undefined,
        note: s.note.trim() || undefined,
      },
      snapshot: { order: s.order, people: s.people, customerName: s.customerName, total, change: 0 },
    };
    posStore.set({ sending: false, sent: false, orderNo: "…", view: "done", lastChange: 0, lastTotal: total, receiptKind: "pendiente", receiptJobId: job.id });
    enqueueOutbox(job);
    return;
  }
  const res = await persistPending();
  if (!res.ok) return;
  posStore.set({
    sent: true,
    orderNo: res.folio,
    view: "done",
    lastChange: 0,
    lastTotal: res.total,
    receiptKind: "pendiente",
  });
}

/**
 * Store the ticket as a pending order (or re-save the one being edited)
 * without leaving the current screen. Labels print on the first send only.
 */
async function persistPending(): Promise<{ ok: true; folio: string; ordenId: string; total: number } | { ok: false }> {
  const s = posStore.get();
  if (!s.order.length || s.sending) return { ok: false };
  if (s.order.some((l) => l.missing)) {
    posStore.set({ sendError: "Quita el producto no disponible para continuar." });
    return { ok: false };
  }
  posStore.set({ sending: true, sendError: null });
  const res = await safeAction(guardarPendiente({
    ordenId: s.pending?.id,
    orderType: s.orderType,
    sinGluten: s.noteSinGluten,
    lines: linesPayload(s.order),
    customerName: s.customerName.trim() || undefined,
    customerNames: s.people.length ? s.people : undefined,
    note: s.note.trim() || undefined,
  }));
  if (!res.ok) {
    posStore.set({ sending: false, sendError: res.error });
    return { ok: false };
  }
  posStore.set({ sending: false });
  if (!s.pending) printSaleLabels({ order: s.order, people: s.people, customerName: s.customerName, catalog: s.catalog }, res.folio, res.ordenId);
  void refreshPendientes();
  nudge("ordenes");
  return { ok: true, folio: res.folio, ordenId: res.ordenId, total: res.total };
}

// ── pending list ────────────────────────────────────────────────
let refreshing = false;
let refreshAgain = false;
/**
 * Reload the org's open orders. Single-flight, but a call that arrives while
 * one is in progress queues exactly one more run — a sale that lands during
 * a refresh must not leave the badge stale until the next tick.
 */
const PENDIENTES_KEY = "pos:pendientes";
/** Show the last known queue immediately; the refresh that follows corrects it. */
export function hydratePendientes() {
  try {
    const raw = window.localStorage.getItem(PENDIENTES_KEY);
    if (!raw) return;
    const cached = JSON.parse(raw) as PendingOrder[];
    posStore.set((st) => (st.pendientes.length ? st : { ...st, pendientes: cached }));
  } catch { /* ignore */ }
}
export async function refreshPendientes() {
  if (refreshing) {
    refreshAgain = true;
    return;
  }
  refreshing = true;
  posStore.set({ pendientesLoading: true });
  try {
    do {
      refreshAgain = false;
      try {
        const res = await listarPendientes();
        setOnline(true);
        if (res.ok) {
          posStore.set((st) => {
            // A pending order loaded for payment follows the stored total, so
            // the tender never shows a number the server won't charge.
            const fresh = st.pending?.mode === "charge" ? res.orders.find((o) => o.id === st.pending!.id) : undefined;
            try { window.localStorage.setItem(PENDIENTES_KEY, JSON.stringify(res.orders)); } catch { /* ignore */ }
            return {
              ...st,
              pendientes: res.orders,
              pendientesError: null,
              pending: fresh && st.pending
                ? { ...st.pending, total: fresh.total, paid: fresh.paid, pagos: fresh.pagos, items: fresh.items, people: rebuildPeople(fresh) }
                : st.pending,
            };
          });
        } else posStore.set({ pendientesError: res.error });
      } catch {
        setOnline(false);
        posStore.set({ pendientesError: "Sin conexión con el servidor." });
      }
    } while (refreshAgain);
  } finally {
    refreshing = false;
    posStore.set({ pendientesLoading: false });
  }
  void refreshPorEntregar();
}
/** Bumped by every delivery tap: a count that started before it is stale. */
let entregaSeq = 0;
/** Recount today's orders still to deliver. Quiet on failure: the badge keeps its last number. */
export async function refreshPorEntregar() {
  const seq = entregaSeq;
  try {
    const res = await contarPorEntregar();
    if (res.ok && seq === entregaSeq) posStore.set({ porEntregar: res.n });
  } catch {
    // Offline — the next refresh catches up.
  }
}
// ── Pedidos view (queue + history) ──────────────────────────────
let ordenesReq = 0;
const ordenesKey = (s: Pick<PosState, "ordenesTab" | "ordenesDay">) => `pos:ordenes:${s.ordenesTab}:${s.ordenesTab === "pendiente" || s.ordenesTab === "por_entregar" ? "" : s.ordenesDay}`;
/** Reload the Pedidos view for the current tab/day. Latest request wins. */
export async function refreshOrdenes() {
  const s = posStore.get();
  const req = ++ordenesReq;
  posStore.set({ ordenesLoading: true });
  try {
    const res = await listarOrdenes({ status: s.ordenesTab, day: s.ordenesDay });
    if (req !== ordenesReq) return;
    setOnline(true);
    if (res.ok) {
      posStore.set({ ordenes: res.orders, ordenesError: null, ordenesLoading: false });
      try { window.localStorage.setItem(ordenesKey(s), JSON.stringify(res.orders)); } catch { /* ignore */ }
    } else posStore.set({ ordenesError: res.error, ordenesLoading: false });
  } catch {
    if (req !== ordenesReq) return;
    setOnline(false);
    // Offline: the last list this register saw for the tab/day (the pending
    // queue keeps its own cache), plus the queued orders the view adds itself.
    let cached: PosOrder[] | null = null;
    try { cached = JSON.parse(window.localStorage.getItem(ordenesKey(s)) ?? "null") as PosOrder[] | null; } catch { /* ignore */ }
    if (!cached && s.ordenesTab === "pendiente") cached = s.pendientes;
    posStore.set({
      ordenes: cached ?? [],
      ordenesError: "Sin conexión: se muestra lo último guardado en esta caja.",
      ordenesLoading: false,
    });
  }
}
/** Open the Pedidos screen (defaults to the pending queue). */
export function openOrdenes(tab?: OrdersTab) {
  posStore.set((st) => ({
    ...st,
    view: "ordenes",
    sheet: null,
    ordenesTab: tab ?? st.ordenesTab,
  }));
  void refreshOrdenes();
  void refreshPendientes();
}
/** The Etiquetas screen: print or reprint a name / cup / phrase label on demand. */
export function openEtiquetas() {
  posStore.set({ view: "etiquetas", sheet: null, ticketOpen: false });
}
export function closeEtiquetas() {
  posStore.set({ view: "sale" });
}
export function closeOrdenes() {
  posStore.set({ view: "sale", ordenSel: null });
}
export function setOrdenesTab(tab: OrdersTab) {
  posStore.set({ ordenesTab: tab, ordenSel: null, ordenes: [], merge: { ...MERGE_OFF } });
  void refreshOrdenes();
}
export function setOrdenesDay(day: string) {
  posStore.set({ ordenesDay: day, ordenSel: null, ordenes: [] });
  void refreshOrdenes();
}
export function selectOrden(id: string | null) {
  posStore.set((st) => ({ ...st, ordenSel: st.ordenSel === id ? null : id }));
}

// ── combining pending orders ────────────────────────────────────
const MERGE_OFF = { on: false, sel: [] as string[], target: null, targetChosen: false, confirming: false, busy: false, error: null };
export function startMerge() {
  posStore.set({ merge: { ...MERGE_OFF, on: true }, ordenSel: null });
}
export function cancelMerge() {
  posStore.set({ merge: { ...MERGE_OFF } });
}
/** Tap a card while combining: in or out of the selection; the oldest folio is the target unless chosen. */
export function toggleMergeSel(id: string) {
  posStore.set((st) => {
    const sel = st.merge.sel.includes(id) ? st.merge.sel.filter((x) => x !== id) : [...st.merge.sel, id];
    // A target the cashier picked sticks while it stays selected; otherwise the oldest folio.
    const keep = st.merge.targetChosen && st.merge.target && sel.includes(st.merge.target);
    const target = keep ? st.merge.target : defaultMergeTarget(st.ordenes.filter((o) => sel.includes(o.id)));
    return { ...st, merge: { ...st.merge, sel, target, targetChosen: !!keep, error: null } };
  });
}
export function setMergeTarget(id: string) {
  posStore.set((st) => (st.merge.sel.includes(id) ? { ...st, merge: { ...st.merge, target: id, targetChosen: true } } : st));
}
export function setMergeConfirming(on: boolean) {
  posStore.set((st) => ({ ...st, merge: { ...st.merge, confirming: on, error: null } }));
}
export async function confirmMerge() {
  const s = posStore.get();
  const { target, sel, busy } = s.merge;
  if (!target || sel.length < 2 || busy) return;
  posStore.set({ merge: { ...s.merge, busy: true, error: null } });
  const res = await combinarPendientes({ targetId: target, sourceIds: sel.filter((id) => id !== target) });
  if (!res.ok) {
    posStore.set((st) => ({ ...st, merge: { ...st.merge, busy: false, error: res.error } }));
    return;
  }
  posStore.set({ merge: { ...MERGE_OFF }, ordenSel: res.targetId });
  await refreshOrdenes();
  void refreshPendientes();
}
/** Reprint the kitchen label of any stored order. */
export function printLabelFor(o: PosOrder) {
  const s = posStore.get();
  printNameLabels(rebuildPeople(o), o.customerName, o.folio, s.catalog.orgName);
}

function loadPending(o: PendingOrder, mode: "edit" | "charge") {
  const s = posStore.get();
  const { lines } = rebuildLines(o, s.catalog);
  posStore.set({
    order: lines,
    customerName: o.customerName,
    people: rebuildPeople(o),
    // Start neutral so the cashier consciously picks who the next drink is for.
    activePerson: null,
    note: o.note,
    orderType: o.orderType,
    noteSinGluten: o.sinGluten,
    pending: { id: o.id, folio: o.folio, total: o.total, mode, paid: o.paid, pagos: o.pagos, items: o.items, people: rebuildPeople(o) },
    split: false,
    splitTarget: null,
    ordenSel: null,
    sheet: null,
    sent: false,
    sendError: null,
  });
}
/** Open a pending order in the ticket to change it. */
export function editPending(o: PendingOrder) {
  loadPending(o, "edit");
  // Land on the catalog (the bar at the bottom says which order is loaded):
  // the usual reason to edit is to add something to it.
  posStore.set({ view: "sale", ticketOpen: false });
}
/** Take payment for a pending order (stored total). */
export function chargePending(o: PendingOrder) {
  loadPending(o, "charge");
  posStore.set({ view: "tender", tendered: null, payMethod: "efectivo" });
  void refreshPendientes();
}
/** Take payment for a pending order person by person. */
export function chargePendingSplit(o: PendingOrder) {
  loadPending(o, "charge");
  posStore.set({ view: "tender", tendered: null, payMethod: "efectivo", split: true, splitTarget: null });
  void refreshPendientes();
}
/** Void a pending order; if it was loaded in the ticket, clear the ticket too. */
export async function cancelPending(id: string) {
  // Optimistic: the card leaves at once; the server confirms behind, and a
  // refusal puts it back with the reason.
  const before = posStore.get();
  posStore.set({
    pendientes: before.pendientes.filter((o) => o.id !== id),
    pendientesError: null,
    // In the queue the card leaves; in history it turns cancelada in place.
    ordenes: before.ordenesTab === "pendiente"
      ? before.ordenes.filter((o) => o.id !== id)
      : before.ordenes.map((o) => (o.id === id ? { ...o, status: "cancelada" as const } : o)),
    ordenSel: before.ordenSel === id ? null : before.ordenSel,
  });
  if (before.pending?.id === id) discardPendingEdit();
  let res: Awaited<ReturnType<typeof cancelarPendiente>>;
  try {
    res = await cancelarPendiente({ ordenId: id });
  } catch {
    res = { ok: false, error: "Sin conexión con el servidor." };
  }
  if (!res.ok) posStore.set({ pendientesError: res.error });
  void refreshPendientes();
  nudge("ordenes");
  if (posStore.get().view === "ordenes") void refreshOrdenes();
}
/**
 * Mark an order delivered (or undo). Optimistic: the card flips and the badge
 * moves at once; a refusal flips it back with the reason. In «Por entregar» the
 * card stays until the next reload, so a wrong tap can be undone in place.
 */
export async function marcarEntregada(id: string, entregada: boolean) {
  const before = posStore.get();
  const at = entregada ? new Date().toISOString() : null;
  const flip = (list: PosOrder[], v: string | null) => list.map((o) => (o.id === id ? { ...o, entregadaAt: v } : o));
  const prev = [...before.ordenes, ...before.pendientes].find((o) => o.id === id)?.entregadaAt ?? null;
  if (!!prev === entregada) return;
  entregaSeq++;
  posStore.set((st) => ({
    ...st,
    ordenes: flip(st.ordenes, at),
    pendientes: flip(st.pendientes, at),
    porEntregar: Math.max(0, st.porEntregar + (entregada ? -1 : 1)),
    ordenesError: null,
  }));
  let res: Awaited<ReturnType<typeof marcarEntrega>>;
  try {
    res = await marcarEntrega({ ordenId: id, entregada });
  } catch {
    res = { ok: false, error: "Sin conexión: no se marcó la entrega." };
  }
  if (!res.ok) {
    entregaSeq++;
    posStore.set((st) => ({ ...st, ordenes: flip(st.ordenes, prev), pendientes: flip(st.pendientes, prev), ordenesError: res.ok ? null : res.error }));
    void refreshPorEntregar();
    return;
  }
  const fixed = res.entregadaAt;
  posStore.set((st) => ({ ...st, ordenes: flip(st.ordenes, fixed), pendientes: flip(st.pendientes, fixed) }));
  void refreshPorEntregar();
  nudge("ordenes");
}
/** Drop the loaded pending order from the ticket without saving. */
export function discardPendingEdit() {
  resetConversation();
}

/** A rating link that went out on a QR label: whose it is and which cup (ticket line) it is worth. */
type EnlaceVenta = { codigo: string; customer: string | null; linea: number; resto: boolean };

/** How long a cup's set waits for its AI phrase before printing a fallback one. */
const FRASE_WAIT_MS = 8_000;
/** Sales print one after the other: a sale waiting on its phrases never interleaves with the next. */
let labelChain: Promise<void> = Promise.resolve();

/**
 * Everything that prints when an order is registered. Every prepared drink
 * gets the same four labels in a row — its name ("Pa' Juan" or the order
 * label), its rating QR, the drink label and its phrase (planSaleLabels) —
 * whether it is alone or one of many in the order. The phrases are asked
 * for all at once up front; a cup whose phrase is late or failed (AI down,
 * offline) prints a fallback phrase, so a set is never short. Each QR is a
 * one-use link made here and registered in the background. Nothing blocks
 * the sale.
 */
function printSaleLabels(
  s: { order: OrderLine[]; people: string[]; customerName: string; catalog: PosCatalog },
  folio: string,
  ordenId: string | null,
): EnlaceVenta[] {
  const { orgName, instagram, cupArt } = s.catalog;
  const jobs = planSaleLabels({ order: s.order, people: s.people, byId: s.catalog.byId, tableName: s.customerName.trim() });
  const enlaces: EnlaceVenta[] = [];
  const codes = new Map<SaleLabelJob, string>();
  for (const j of jobs) {
    if (j.kind !== "califica") continue;
    const codigo = nuevoCodigo();
    codes.set(j, codigo);
    enlaces.push({ codigo, customer: j.customer || null, linea: j.line, resto: j.resto });
  }
  const cups = jobs.flatMap((j) => (j.kind === "frase" ? [j.productId] : []));
  // Offline (no ordenId yet) the codes ride with the queued order and are registered when it lands.
  if (enlaces.length > 0 && ordenId) void registrarEnlacesVenta(ordenId, enlaces);
  if (cups.length > 0) lastCups = cups;
  const frases = cups.map((id) => askFrase(id));
  if (frases.length) markFraseBatch(+1);
  // Fallback phrases start at a random one and then rotate, so two cups don't repeat.
  const base = Math.floor(Math.random() * 1000);
  labelChain = labelChain.then(async () => {
    let k = 0;
    for (const j of jobs) {
      if (j.kind === "name") printOrderLabel({ name: j.name, folio, orgName });
      else if (j.kind === "califica") printCalificaLabel(urlCalificacion(codes.get(j)!), cupArt);
      else if (j.kind === "drink") printDrinkLabel({ name: j.item.name, spec: j.item.spec, desc: j.item.desc, customer: j.item.customer, brand: orgName });
      else {
        const text = await frases[k];
        printMessageLabel(text ?? fraseRespaldo(base + k), instagram);
        k += 1;
      }
    }
  }).catch((err) => console.error("[pos] label run failed:", err)).finally(() => {
    if (frases.length) markFraseBatch(-1);
  });
  return enlaces;
}

/** The AI phrase for one cup, or null if it fails or takes longer than FRASE_WAIT_MS. Never throws. */
function askFrase(productId: string): Promise<string | null> {
  const ai = generarFrase(undefined, productId)
    .then((r) => {
      if (r.ok) {
        posStore.set({ frase: r.texto, fraseError: null });
        return r.texto;
      }
      posStore.set({ fraseError: r.error });
      return null;
    })
    .catch(() => null);
  const late = new Promise<null>((resolve) => setTimeout(() => resolve(null), FRASE_WAIT_MS));
  return Promise.race([ai, late]);
}

let fraseBatches = 0;
/** The receipt's «escribiendo frase…» spinner stays on while any sale is still waiting on phrases. */
function markFraseBatch(delta: 1 | -1) {
  fraseBatches = Math.max(0, fraseBatches + delta);
  posStore.set({ fraseLoading: fraseBatches > 0 });
}

/**
 * Tell the server which rating codes went out with a sale. The labels are
 * already printing; this only has to land before the customer scans, so it
 * retries a few times over a minute and then gives up quietly.
 */
async function registrarEnlacesVenta(ordenId: string, enlaces: EnlaceVenta[]) {
  for (const espera of [0, 3_000, 15_000, 45_000]) {
    if (espera) await new Promise((r) => setTimeout(r, espera));
    try {
      if ((await registrarCalificaciones({ ordenId, enlaces })).ok) return;
    } catch {
      /* offline: try again */
    }
  }
  console.warn("[pos] rating links not registered for", ordenId);
}

/** The cups of the last sale, so «Frase IA» on the receipt writes about one of them. */
let lastCups: string[] = [];

/** The "Pa' <nombre>" labels of a stored order (one per person, else the order label). */
function printNameLabels(names: ReadonlyArray<string>, tableName: string, folio: string, orgName: string) {
  if (names.length === 0) printOrderLabel({ name: tableName, folio, orgName });
  for (const n of names) printOrderLabel({ name: n, folio, orgName });
}

/**
 * Ask the AI for one more phrase and print it: about one of the cups of the
 * sale on screen when there was one, a coffee phrase (funny / motivational /
 * a nod to today's Colombian news) otherwise.
 */
export async function printFrase() {
  const s = posStore.get();
  if (s.fraseLoading) return;
  posStore.set({ fraseLoading: true, fraseError: null });
  try {
    const cup = lastCups.length ? lastCups[Math.floor(Math.random() * lastCups.length)] : undefined;
    const res = await generarFrase(undefined, cup);
    if (res.ok) {
      posStore.set({ frase: res.texto, fraseLoading: false });
      printMessageLabel(res.texto, s.catalog.instagram);
    } else posStore.set({ fraseLoading: false, fraseError: res.error });
  } catch {
    posStore.set({ fraseLoading: false, fraseError: "No se pudo generar la frase." });
  }
}

/** Reprint the name labels of the sale on the receipt screen. */
export function reprintLabel() {
  const s = posStore.get();
  if (!s.sent) return;
  printNameLabels(s.people, s.customerName.trim(), s.orderNo, s.catalog.orgName);
}


// ── cloud speech-to-text (MediaRecorder + VAD → Groq Whisper) ───
// We record the mic continuously but cut a segment the moment the speaker
// pauses (voice-activity detection via Web Audio), so each utterance is sent
// to the transcribeAudio server action right after it ends — snappy, and we
// never send silent clips (which Whisper would hallucinate text for). The
// browser's own Web Speech API is avoided: it relies on Google's backend,
// which is blocked on some networks.
const MIN_SEGMENT_BYTES = 1600; // skip near-empty blobs
const VAD_RMS_THRESHOLD = 0.018; // loudness above this counts as speech
const VAD_SILENCE_MS = 600; // a pause this long ends an utterance
const VAD_MIN_UTTERANCE_MS = 350; // ignore blips shorter than this
const VAD_MAX_SEGMENT_MS = 9000; // flush long continuous speech anyway

function pickAudioMime(): string {
  const MR = typeof window !== "undefined" ? window.MediaRecorder : undefined;
  if (!MR) return "";
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"]) {
    if (MR.isTypeSupported(m)) return m;
  }
  return "";
}

// When Groq's free-tier rate limit (429) hits, pause uploads until this time
// instead of hammering the quota every utterance.
let sttCooldownUntil = 0;

async function sendSegment(blob: Blob) {
  if (blob.size < MIN_SEGMENT_BYTES) return;
  if (Date.now() < sttCooldownUntil) return; // backing off after a 429
  posStore.set({ interim: "Transcribiendo…" });
  try {
    const fd = new FormData();
    fd.append("audio", blob, "segment.webm");
    const res = await transcribeAudio(fd);
    if (res.ok) {
      const t = res.text.trim();
      if (t) appendTranscript("cliente", t);
      // A success clears any lingering rate-limit / error note.
      if (posStore.get().micNote) posStore.set({ micNote: null });
    } else if (res.fatal) {
      posStore.set({ listening: false, micNote: res.error });
    } else if (res.rateLimited) {
      sttCooldownUntil = Date.now() + (res.retryAfterMs ?? 6000);
      posStore.set({ micNote: res.error });
    } else if (res.error) {
      posStore.set({ micNote: res.error });
    }
  } catch (err) {
    console.warn("[pos stt] segment failed:", err);
  } finally {
    if (posStore.get().interim === "Transcribiendo…") posStore.set({ interim: "" });
  }
}

function micErrorNote(err: unknown): string {
  const name = (err as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Micrófono bloqueado. Toca el candado 🔒 junto a la URL → Micrófono → Permitir, y reactiva el micrófono.";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "No se detectó ningún micrófono. Conecta uno y reactiva el micrófono.";
  if (typeof window !== "undefined" && !window.isSecureContext)
    return "El micrófono solo funciona en HTTPS (o localhost). Ábrelo en el sitio seguro, o escribe abajo.";
  return "No se pudo acceder al micrófono. Revisa los permisos, o escribe la conversación abajo.";
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function useMicTranscribe(listening: boolean) {
  React.useEffect(() => {
    if (!listening) return;
    const AudioCtx =
      typeof window !== "undefined"
        ? window.AudioContext || (window as any).webkitAudioContext
        : undefined;
    if (typeof window === "undefined" || !navigator.mediaDevices || !window.MediaRecorder || !AudioCtx) {
      posStore.set({
        listening: false,
        micNote: "Este navegador no permite grabar audio. Usa un navegador moderno, o escribe abajo.",
      });
      return;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;
    let recorder: MediaRecorder | null = null;
    let audioCtx: AudioContext | null = null;
    let raf = 0;
    const mime = pickAudioMime();

    // VAD state for the current segment.
    let chunks: BlobPart[] = [];
    let segStart = 0;
    let hadSpeech = false;
    let silenceSince = 0;

    const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

    const startSegment = () => {
      if (cancelled || !stream) return;
      chunks = [];
      hadSpeech = false;
      silenceSince = 0;
      segStart = now();
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size) chunks.push(e.data);
      };
      recorder.onstop = () => {
        const sawSpeech = hadSpeech;
        const blob = new Blob(chunks, { type: recorder?.mimeType || mime || "audio/webm" });
        // Open the next segment immediately so we never miss the next utterance.
        if (!cancelled && posStore.get().listening) startSegment();
        // Only transcribe segments that actually contained speech — sending
        // silence makes Whisper hallucinate phantom phrases.
        if (sawSpeech) void sendSegment(blob);
      };
      recorder.start();
    };

    const cutSegment = () => {
      if (recorder && recorder.state === "recording") recorder.stop();
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        posStore.set({ micNote: null });

        audioCtx = new AudioCtx();
        if (audioCtx.state === "suspended") await audioCtx.resume().catch(() => {});
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);

        startSegment();

        const tick = () => {
          if (cancelled) return;
          analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) {
            const x = (buf[i] - 128) / 128;
            sum += x * x;
          }
          const rms = Math.sqrt(sum / buf.length);
          const t = now();

          if (rms > VAD_RMS_THRESHOLD) {
            hadSpeech = true;
            silenceSince = 0;
            if (posStore.get().interim !== "Escuchando…") posStore.set({ interim: "Escuchando…" });
          } else if (hadSpeech && !silenceSince) {
            silenceSince = t;
          }

          const endedByPause =
            hadSpeech && silenceSince && t - silenceSince > VAD_SILENCE_MS && t - segStart > VAD_MIN_UTTERANCE_MS;
          const tooLong = t - segStart > VAD_MAX_SEGMENT_MS;
          if (endedByPause || tooLong) cutSegment();

          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch (err) {
        console.warn("[pos stt] getUserMedia failed:", err);
        posStore.set({ listening: false, micNote: micErrorNote(err) });
      }
    })();

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      try {
        if (recorder && recorder.state !== "inactive") {
          recorder.onstop = null;
          recorder.stop();
        }
      } catch {}
      if (audioCtx) audioCtx.close().catch(() => {});
      if (stream) stream.getTracks().forEach((t) => t.stop());
      posStore.set({ interim: "" });
    };
  }, [listening]);
}
/* eslint-enable @typescript-eslint/no-explicit-any */
