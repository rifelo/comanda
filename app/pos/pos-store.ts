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
import { planSaleLabels } from "@/lib/pos/drink-label";
import {
  cancelarPendiente,
  cobrarPendiente,
  crearOrden,
  generarFrase,
  guardarPendiente,
  listarOrdenes,
  listarPendientes,
  registrarPago,
  combinarPendientes,
  posSuggest,
  transcribeAudio,
} from "./actions";
import { printOrderLabel, printMessageLabel, printDrinkLabel, printInstagramLabel } from "@/lib/printer/serial";

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
  view: "sale" | "tender" | "done" | "ordenes";
  /** Item sheet (modifiers / qty) — add a new product or edit a ticket line. */
  sheet: { mode: "add"; productId: string } | { mode: "edit"; idx: number } | { mode: "receta"; productId: string } | null;
  /** Free-text search over the catalog (name / sku / description). */
  search: string;
  /** Assistant drawer open? */
  aiOpen: boolean;
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
  pendientesError: null,
  ordenesTab: "pendiente",
  ordenesDay: bogotaDay(),
  ordenes: [],
  ordenesLoading: false,
  ordenesError: null,
  ordenSel: null,
  merge: { on: false, sel: [], target: null, targetChosen: false, confirming: false, busy: false, error: null },
  receiptKind: "pagada",
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
  posStore.set((s) => ({ ...s, order: [], customerName: "", people: [], activePerson: null, note: "", noteSinGluten: false, sent: false, sheet: null, view: "sale", tendered: null }));
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
  }));
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
  const list = await listarPendientes();
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
  const res = await registrarPago({
    ordenId: s.pending.id,
    customerName: target.kind === "share" ? target.customer : null,
    payment: { method: s.payMethod, tendered },
    amount: target.kind === "share" ? amount : undefined,
  });
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

  let res: Awaited<ReturnType<typeof crearOrden>>;
  if (s.pending) {
    if (s.pending.mode === "edit") {
      const saved = await guardarPendiente({ ...base, ordenId: s.pending.id });
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
    res = await cobrarPendiente({ ordenId: s.pending.id, payment });
  } else {
    res = await crearOrden({ ...base, payment });
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
    // Label for the order (customer name + folio). Queued and non-blocking:
    // a printer problem shows on the chip, never on the receipt. A pending
    // order already got its label when it was sent.
    if (!s.pending) {
      printSaleLabels(s, res.folio);
    }
    void refreshPendientes();
  } else posStore.set({ sending: false, sendError: res.error });
}

/**
 * "Enviar · pagar después": persist the ticket as a pending order (or re-save
 * the pending order being edited) and free the register. The kitchen label
 * prints on the first send only.
 */
export async function savePending() {
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
  const res = await guardarPendiente({
    ordenId: s.pending?.id,
    orderType: s.orderType,
    sinGluten: s.noteSinGluten,
    lines: linesPayload(s.order),
    customerName: s.customerName.trim() || undefined,
    customerNames: s.people.length ? s.people : undefined,
    note: s.note.trim() || undefined,
  });
  if (!res.ok) {
    posStore.set({ sending: false, sendError: res.error });
    return { ok: false };
  }
  posStore.set({ sending: false });
  if (!s.pending) printSaleLabels(s, res.folio);
  void refreshPendientes();
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
        if (res.ok) {
          posStore.set((st) => {
            // A pending order loaded for payment follows the stored total, so
            // the tender never shows a number the server won't charge.
            const fresh = st.pending?.mode === "charge" ? res.orders.find((o) => o.id === st.pending!.id) : undefined;
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
        posStore.set({ pendientesError: "Sin conexión con el servidor." });
      }
    } while (refreshAgain);
  } finally {
    refreshing = false;
    posStore.set({ pendientesLoading: false });
  }
}
// ── Pedidos view (queue + history) ──────────────────────────────
let ordenesReq = 0;
/** Reload the Pedidos view for the current tab/day. Latest request wins. */
export async function refreshOrdenes() {
  const s = posStore.get();
  const req = ++ordenesReq;
  posStore.set({ ordenesLoading: true });
  try {
    const res = await listarOrdenes({ status: s.ordenesTab, day: s.ordenesDay });
    if (req !== ordenesReq) return;
    if (res.ok) posStore.set({ ordenes: res.orders, ordenesError: null, ordenesLoading: false });
    else posStore.set({ ordenesError: res.error, ordenesLoading: false });
  } catch {
    if (req === ordenesReq) posStore.set({ ordenesError: "Sin conexión con el servidor.", ordenesLoading: false });
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
  posStore.set({ view: "sale" });
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
  const res = await cancelarPendiente({ ordenId: id });
  if (!res.ok) {
    posStore.set({ pendientesError: res.error });
    void refreshPendientes();
    return;
  }
  const s = posStore.get();
  posStore.set({
    pendientes: s.pendientes.filter((o) => o.id !== id),
    pendientesError: null,
    // Reflect it in the Pedidos view right away; the refresh confirms.
    ordenes: s.ordenes.map((o) => (o.id === id ? { ...o, status: "cancelada" as const } : o)),
  });
  if (s.pending?.id === id) discardPendingEdit();
  if (s.view === "ordenes") void refreshOrdenes();
}
/** Drop the loaded pending order from the ticket without saving. */
export function discardPendingEdit() {
  resetConversation();
}

/**
 * Everything that prints when an order is registered, in the order the
 * counter wants to pick it up. With people on the ticket: "Pa' Juan", his
 * cups, "Pa' María", her cups… (planSaleLabels); without: the order label
 * and the cups. The Instagram QR once. Then one phrase per cup — they wait
 * on the AI and are queued when it answers. A missing piece (no handle, no
 * drinks, AI down) just doesn't print; nothing blocks the sale.
 */
function printSaleLabels(s: PosState, folio: string) {
  const orgName = s.catalog.orgName;
  const jobs = planSaleLabels({ order: s.order, people: s.people, byId: s.catalog.byId, tableName: s.customerName.trim(), instagram: !!s.catalog.instagram });
  let cups = 0;
  for (const j of jobs) {
    if (j.kind === "name") printOrderLabel({ name: j.name, folio, orgName });
    else if (j.kind === "instagram") printInstagramLabel(s.catalog.instagram!, s.catalog.cupArt);
    else {
      cups += 1;
      printDrinkLabel({ name: j.item.name, spec: j.item.spec, desc: j.item.desc, customer: j.item.customer, brand: orgName });
    }
  }
  if (cups > 0) void printFrases(cups);
}

/** The "Pa' <nombre>" labels of a stored order (one per person, else the order label). */
function printNameLabels(names: ReadonlyArray<string>, tableName: string, folio: string, orgName: string) {
  if (names.length === 0) printOrderLabel({ name: tableName, folio, orgName });
  for (const n of names) printOrderLabel({ name: n, folio, orgName });
}

/**
 * One phrase label per cup. Each cup gets its own phrase when the AI
 * answers every request; if some fail (rate limit), the successful ones are
 * reused so every cup still gets a message. None answered → nothing prints.
 */
export async function printFrases(n: number) {
  const s = posStore.get();
  if (n <= 0 || s.fraseLoading) return;
  posStore.set({ fraseLoading: true, fraseError: null });
  try {
    const results = await Promise.allSettled(Array.from({ length: n }, () => generarFrase()));
    const ok: string[] = [];
    let err: string | null = null;
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.ok) ok.push(r.value.texto);
      else if (r.status === "fulfilled" && !r.value.ok) err = r.value.error;
    }
    if (!ok.length) {
      posStore.set({ fraseLoading: false, fraseError: err ?? "No se pudo generar la frase." });
      return;
    }
    for (let i = 0; i < n; i++) printMessageLabel(ok[i % ok.length], s.catalog.instagram, s.catalog.cupArt);
    posStore.set({ frase: ok[0], fraseLoading: false });
  } catch {
    posStore.set({ fraseLoading: false, fraseError: "No se pudo generar la frase." });
  }
}

/**
 * Ask the AI for a short coffee phrase (funny / motivational / a nod to
 * today's Colombian news) and print it as a second label for the cup.
 */
export async function printFrase() {
  const s = posStore.get();
  if (s.fraseLoading) return;
  posStore.set({ fraseLoading: true, fraseError: null });
  try {
    const res = await generarFrase();
    if (res.ok) {
      posStore.set({ frase: res.texto, fraseLoading: false });
      printMessageLabel(res.texto, s.catalog.instagram, s.catalog.cupArt);
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
