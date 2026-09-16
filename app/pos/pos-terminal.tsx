"use client";

/**
 * Punto de venta — Square-style register for a coffee shop.
 *
 * One full-screen view, tablet-first (landscape ≥ 1024, degrades to 768):
 *
 *   ┌ top bar: station · search · assistant toggle · account/unlink ─────────┐
 *   │ catalog (tabs → tile grid, big touch targets)   │ ticket (lines, total,│
 *   │                                                 │ "Cobrar $X")          │
 *   └─────────────────────────────────────────────────┴───────────────────────┘
 *
 *   · Tap a tile → added; tiles with modifiers open the *item sheet* (size,
 *     milk, extras, qty) before landing on the ticket. Tap a ticket line to
 *     edit it in the same sheet.
 *   · "Cobrar" → *tender* screen: efectivo (quick amounts + keypad, change
 *     computed live), tarjeta, transferencia → confirm → *receipt* → "Nuevo".
 *   · The AI assistant lives in a slide-in drawer (mic, suggestions,
 *     transcript). When closed, its top suggestion shows as a slim strip above
 *     the grid so the cashier never has to leave the sale to use it.
 *
 * All state/logic lives in pos-store.ts; this file only renders.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Stamp } from "@/components/comanda/primitives";
import {
  posMoney,
  POS_KIND_LABEL,
  FAV_CAT,
  COMBO_CAT,
  type PosCatalog,
  type PosMenuItem,
  type PosCombo,
  type PosModGroup,
  type PosSuggestKind,
} from "@/lib/pos/types";
import { desvincularPos } from "./actions";
import {
  CatalogCtx,
  StationCtx,
  useCatalog,
  usePos,
  posStore,
  useMicTranscribe,
  scheduleSuggest,
  orderTotal,
  modLinePrice,
  modSummary,
  posDefaultMods,
  tapItem,
  addCombo,
  addLineWithMods,
  replaceLine,
  removeLine,
  changeQty,
  clearTicket,
  applyAct,
  dismissSuggestion,
  appendTranscript,
  resetConversation,
  startTender,
  cancelTender,
  completeSale,
  reprintLabel,
  printFrase,
  savePending,
  openOrdenes,
  closeOrdenes,
  setOrdenesTab,
  setOrdenesDay,
  refreshOrdenes,
  selectOrden,
  printLabelFor,
  refreshPendientes,
  editPending,
  chargePending,
  cancelPending,
  discardPendingEdit,
  ticketTotal,
  PAY_METHODS,
  type OrderLine,
  type ModSelection,
  type SuggestionCardState,
  type PayMethod,
} from "./pos-store";
import { timeAgo, bogotaDay, shiftDay, dayLabel, bogotaTime } from "@/lib/pos/pending";
import type { PosOrder, OrdersTab } from "@/lib/pos/types";
import {
  usePrinter,
  usePrinterAutoConnect,
  connectPrinter,
  checkPrinter,
  printTestLabel,
  printInstagramLabel,
  INSTAGRAM_FOLIO,
  FRASE_FOLIO,
  STICKER_FOLIO,
  printStickerLabel,
  setLabelDefaults,
  type PrinterStatus,
} from "@/lib/printer/serial";
import { useDesktopApp, useDesktopAppEvents, installApp, toggleFullscreen } from "@/lib/pwa/desktop";

// ── design tokens → app CSS variables ───────────────────────────
const C = {
  ink: "var(--ink)",
  ink2: "var(--ink-2)",
  paper: "var(--paper)",
  paperLt: "var(--paper-lt)",
  paperDk: "var(--paper-dk)",
  muted: "var(--muted)",
  rule: "var(--rule)",
  ruleSoft: "var(--rule-soft)",
  red: "var(--red)",
  green: "var(--green)",
  amber: "var(--amber)",
} as const;
const F = {
  mono: "var(--font-mono)",
  slab: "var(--font-slab)",
  script: "var(--font-script)",
} as const;

/** Category accent colours for tiles (Square colours its tiles per item). */
const TILE_ACCENTS = [C.red, C.green, C.amber, "#4a6fa5", "#7a4fa0", "#b5651d", "#2f8f8f"];

const TICKET_W = 400;
const DRAWER_W = 400;

// ── one-time CSS ────────────────────────────────────────────────
const POS_CSS = `
  @keyframes pos-eq { 0%,100%{transform:scaleY(.35)} 50%{transform:scaleY(1)} }
  @keyframes pos-rec { 0%,100%{opacity:1} 50%{opacity:.25} }
  @keyframes pos-in  { from{opacity:0; transform:translateY(8px)} to{opacity:1; transform:none} }
  @keyframes pos-slide { from{transform:translateX(24px); opacity:0} to{transform:none; opacity:1} }
  @keyframes pos-hl { 0%,100%{box-shadow:0 0 0 0 rgba(176,58,46,0)} 50%{box-shadow:0 0 0 5px rgba(176,58,46,.16)} }
  .pos-root, .pos-root * { box-sizing: border-box; }
  .pos-root button:not(.cmd-btn){min-height:0}
  .pos-root a{min-height:0}
  .pos-root button { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
  .pos-tile:active:not(:disabled){transform:scale(.97)}
  .pos-tile{transition:transform .06s, border-color .12s}
  .pos-eq i{display:inline-block;width:3px;height:14px;background:currentColor;transform-origin:bottom;
    animation:pos-eq .9s ease-in-out infinite}
  .pos-eq i:nth-child(2){animation-delay:.15s} .pos-eq i:nth-child(3){animation-delay:.3s}
  .pos-eq i:nth-child(4){animation-delay:.45s} .pos-eq i:nth-child(5){animation-delay:.6s}
  .pos-eq.paused i{animation-play-state:paused;transform:scaleY(.4);opacity:.45}
  .pos-rec{animation:pos-rec 1.3s ease-in-out infinite}
  .pos-card{animation:pos-in .35s ease both}
  .pos-drawer{animation:pos-slide .18s ease both}
  .pos-hl{animation:pos-hl 1.6s ease-in-out infinite}
  .pos-scroll{scrollbar-width:thin}
  .pos-scroll::-webkit-scrollbar{width:8px;height:8px} .pos-scroll::-webkit-scrollbar-thumb{background:rgba(0,0,0,.16);border-radius:8px}
  .pos-key:active{background:var(--paper-dk)}
  .pos-line:active{background:var(--paper-dk)}
  @media (max-width: 900px) { .pos-ticket { width: 340px !important; } }
`;

// ════════════════════════════════════════════════════════════════
// Root
// ════════════════════════════════════════════════════════════════
export function PosTerminal({
  catalog,
  station = "Caja 01",
  mode = "user",
}: {
  catalog: PosCatalog;
  /** Header label for this register ("Caja 2"). */
  station?: string;
  /** `device` = paired tablet (no account); `user` = signed-in org member. */
  mode?: "device" | "user";
}) {
  // Seed the store's catalog once so imperative actions can read it. When the
  // catalog has no favorites (a paired device has no user to own them), start
  // on the first real category instead of an empty Favoritos tab.
  React.useEffect(() => {
    const hasFavs = catalog.menu.some((p) => p.fav);
    const firstReal = catalog.cats.find((c) => c.id !== FAV_CAT)?.id;
    const cur = posStore.get().cat;
    posStore.set({
      catalog,
      ...(!hasFavs && firstReal && (cur === FAV_CAT || !cur) ? { cat: firstReal } : {}),
    });
  }, [catalog]);
  // What every printed label shows in its kicker line.
  React.useEffect(() => {
    setLabelDefaults({ station, orgName: catalog.orgName });
  }, [station, catalog.orgName]);

  return (
    <CatalogCtx.Provider value={catalog}>
      <StationCtx.Provider value={station}>
        <Register mode={mode} />
      </StationCtx.Provider>
    </CatalogCtx.Provider>
  );
}

function Register({ mode }: { mode: "device" | "user" }) {
  const s = usePos();
  useMicTranscribe(s.listening);
  // Reopen the label printer if this browser was already paired with it, and
  // follow the USB cable (connect / disconnect events).
  usePrinterAutoConnect();
  // Install prompt / display mode / full screen for the desktop-app chips.
  useDesktopAppEvents();

  // Refresh suggestions when the order changes, so they track the current
  // products (debounced; only once a conversation has started and not sent).
  const orderSig = s.order.map((l) => `${l.id}:${l.qty}:${JSON.stringify(l.mods ?? {})}`).join("|");
  React.useEffect(() => {
    const st = posStore.get();
    if (st.transcript.length && !st.sent) scheduleSuggest(800);
  }, [orderSig]);

  // Open (unpaid) orders: load on mount and keep the badge fresh while the
  // tab is visible — another register may send or settle orders too.
  React.useEffect(() => {
    void refreshPendientes();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshPendientes();
    }, 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Escape closes whatever is on top.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const st = posStore.get();
      if (st.sheet) posStore.set({ sheet: null });
      else if (st.view === "tender") cancelTender();
      else if (st.view === "ordenes") closeOrdenes();
      else if (st.aiOpen) posStore.set({ aiOpen: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="pos-root cmd-paper" style={{ height: "100dvh", display: "flex", flexDirection: "column", background: C.paper, fontFamily: F.mono, color: C.ink, overflow: "hidden" }}>
      <style>{POS_CSS}</style>
      <TopBar mode={mode} />
      <div style={{ flex: 1, display: "flex", minHeight: 0, position: "relative" }}>
        <Catalog />
        <Ticket />
        {s.aiOpen && <AiDrawer />}
      </div>
      {s.sheet && <ItemSheet key={s.sheet.mode === "add" ? `add:${s.sheet.productId}` : `edit:${s.sheet.idx}`} />}
      {s.view === "ordenes" && <OrdenesScreen />}
      {s.view === "tender" && <TenderScreen />}
      {s.view === "done" && <ReceiptScreen />}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Top bar
// ════════════════════════════════════════════════════════════════
function TopBar({ mode }: { mode: "device" | "user" }) {
  const s = usePos();
  const catalog = useCatalog();
  const station = React.useContext(StationCtx);
  const openCount = s.suggestions.length;

  return (
    <div style={{ height: 58, display: "flex", alignItems: "center", gap: 14, padding: "0 16px", borderBottom: `1.5px solid ${C.ink}`, background: C.paperLt, flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 9, minWidth: 0 }}>
        <span style={{ fontFamily: F.slab, fontSize: 20, lineHeight: 1, whiteSpace: "nowrap" }}>
          comanda<span style={{ color: C.red }}>.</span>
        </span>
        <span style={{ fontSize: 11, color: C.muted, letterSpacing: ".12em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
          {station} · {catalog.orgName}
        </span>
      </div>

      <SearchBox />

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
        <DesktopChips />
        <PrinterChip />
        <PendientesChip />
        <button
          onClick={() => posStore.set((st) => ({ ...st, aiOpen: !st.aiOpen }))}
          title="Asistente de IA"
          aria-pressed={s.aiOpen}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8, height: 40, padding: "0 12px", borderRadius: 3, cursor: "pointer",
            border: `1.5px solid ${s.aiOpen ? C.ink : C.rule}`, background: s.aiOpen ? C.ink : "transparent", color: s.aiOpen ? C.paperLt : C.ink,
            fontFamily: F.mono, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", position: "relative",
          }}
        >
          <span className={s.listening ? "pos-rec" : ""} style={{ width: 8, height: 8, borderRadius: 8, background: s.listening ? C.red : s.aiOpen ? C.paperLt : C.muted, opacity: s.listening ? 1 : 0.6 }} />
          Asistente
          {openCount > 0 && (
            <span className="cmd-num" style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: C.red, color: "#fff", fontSize: 10, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              {openCount}
            </span>
          )}
        </button>
        <Link href="/turno" title="Turno del día: puestos y checklist" style={{ display: "inline-flex", alignItems: "center", height: 40, padding: "0 12px", borderRadius: 3, border: `1.5px solid ${C.rule}`, color: C.ink2, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", textDecoration: "none" }}>
          Turno
        </Link>
        {mode === "device" ? <UnlinkButton station={station} /> : (
          <Link href="/" style={{ display: "inline-flex", alignItems: "center", height: 40, padding: "0 12px", borderRadius: 3, border: `1.5px solid ${C.rule}`, color: C.ink2, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", textDecoration: "none" }}>
            ← Panel
          </Link>
        )}
      </div>
    </div>
  );
}

function SearchBox() {
  const s = usePos();
  const ref = React.useRef<HTMLInputElement>(null);
  return (
    <div style={{ flex: 1, minWidth: 180, maxWidth: 520, position: "relative" }}>
      <span aria-hidden style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: C.muted, fontSize: 14 }}>⌕</span>
      <input
        ref={ref}
        value={s.search}
        onChange={(e) => posStore.set({ search: e.target.value })}
        placeholder="Buscar producto…"
        aria-label="Buscar producto"
        style={{ width: "100%", height: 40, padding: "0 36px 0 32px", border: `1.5px solid ${s.search ? C.ink : C.rule}`, background: C.paper, color: C.ink, fontFamily: F.mono, fontSize: 14, borderRadius: 3, outline: "none" }}
      />
      {s.search && (
        <button onClick={() => { posStore.set({ search: "" }); ref.current?.focus(); }} aria-label="Limpiar búsqueda" style={{ position: "absolute", right: 6, top: 6, width: 28, height: 28, border: "none", background: "transparent", color: C.muted, fontSize: 16, cursor: "pointer" }}>×</button>
      )}
    </div>
  );
}

/** "Pedidos" — opens the Square-style orders screen; badge = open orders. */
function PendientesChip() {
  const s = usePos();
  const n = s.pendientes.length;
  const on = s.view === "ordenes";
  return (
    <button
      onClick={() => (on ? closeOrdenes() : openOrdenes())}
      title="Pedidos: pendientes e historial"
      aria-pressed={on}
      style={{ ...chipStyle, border: `1.5px solid ${on ? C.ink : n ? C.amber : C.rule}`, background: on ? C.ink : "transparent", color: on ? C.paperLt : C.ink, position: "relative" }}
    >
      Pedidos
      {n > 0 && (
        <span className="cmd-num" style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: C.amber, color: "#fff", fontSize: 10, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          {n}
        </span>
      )}
    </button>
  );
}

const chipStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 8, height: 40, padding: "0 12px", borderRadius: 3, cursor: "pointer",
  border: `1.5px solid ${C.rule}`, background: "transparent", color: C.ink,
  fontFamily: F.mono, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", whiteSpace: "nowrap",
};

/**
 * Desktop-app chips: "instalar" while Chrome/Edge offers the install prompt
 * (hidden once installed / already in an app window), and a full-screen
 * toggle. Both need a click — the browser won't install or go full screen
 * without a user gesture; F11 and Esc keep working as usual.
 */
function DesktopChips() {
  const d = useDesktopApp();
  return (
    <>
      {d.canInstall && !d.standalone && (
        <button onClick={() => void installApp()} title="Instalar el POS como app en este PC" style={chipStyle}>
          <span aria-hidden>⤓</span> instalar
        </button>
      )}
      <button
        onClick={() => void toggleFullscreen()}
        aria-pressed={d.fullscreen}
        title={d.fullscreen ? "Salir de pantalla completa (Esc)" : "Pantalla completa (F11)"}
        style={{ ...chipStyle, border: `1.5px solid ${d.fullscreen ? C.ink : C.rule}` }}
      >
        <span aria-hidden>{d.fullscreen ? "⤡" : "⤢"}</span> {d.fullscreen ? "ventana" : "pantalla completa"}
      </button>
    </>
  );
}

const PRINTER_UI: Record<PrinterStatus, { label: string; dot: string; blink?: boolean }> = {
  unsupported: { label: "sin impresora", dot: C.muted },
  disconnected: { label: "conectar impresora", dot: C.muted },
  connecting: { label: "conectando…", dot: C.amber, blink: true },
  ready: { label: "impresora", dot: C.green },
  printing: { label: "imprimiendo…", dot: C.amber, blink: true },
  off: { label: "impresora apagada", dot: C.red },
  error: { label: "impresora", dot: C.red },
};

/**
 * Label-printer chip. Disconnected → click pairs (needs the click: the port
 * picker only opens inside a user gesture). Connected → click prints a test
 * label. Errors show as a red dot with the reason in the tooltip and a line
 * under the bar.
 */
function PrinterChip() {
  const p = usePrinter();
  const ui = PRINTER_UI[p.status];
  const canPair = p.status === "disconnected" || p.status === "error";
  const disabled = p.status === "unsupported" || p.status === "connecting" || p.status === "printing";
  const title = p.note ?? (p.status === "ready" ? "Imprimir etiqueta de prueba" : canPair ? "Conectar la impresora de etiquetas" : ui.label);
  const onClick = () => {
    if (canPair) void connectPrinter();
    else if (p.status === "ready") printTestLabel();
    else if (p.status === "off") void checkPrinter(); // "¿ya la encendí?" without waiting for the heartbeat
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      style={{
        display: "inline-flex", alignItems: "center", gap: 8, height: 40, padding: "0 12px", borderRadius: 3,
        cursor: disabled ? "default" : "pointer", border: `1.5px solid ${p.status === "error" ? C.red : C.rule}`,
        background: "transparent", color: p.status === "unsupported" ? C.muted : C.ink,
        fontFamily: F.mono, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", whiteSpace: "nowrap",
      }}
    >
      <span className={ui.blink ? "pos-rec" : ""} style={{ width: 8, height: 8, borderRadius: 8, background: ui.dot }} />
      {ui.label}
      {p.queued > 0 && (
        <span className="cmd-num" style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: C.ink, color: C.paperLt, fontSize: 10, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          +{p.queued}
        </span>
      )}
    </button>
  );
}

/** Paired-device chip: shows the station name and lets the admin unpair it. */
function UnlinkButton({ station }: { station: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  function onClick() {
    if (pending) return;
    if (!window.confirm(`¿Desvincular "${station}" de esta cuenta? Necesitarás un nuevo código para volver a usarla.`)) return;
    startTransition(async () => {
      await desvincularPos();
      router.refresh();
    });
  }
  return (
    <button onClick={onClick} disabled={pending} title="Desvincular este dispositivo" style={{
      height: 40, padding: "0 12px", borderRadius: 3, cursor: "pointer", border: `1.5px solid ${C.rule}`, background: "transparent", color: C.muted,
      fontFamily: F.mono, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase",
    }}>
      {pending ? "…" : "desvincular"}
    </button>
  );
}

// ════════════════════════════════════════════════════════════════
// Catalog — tabs + tile grid
// ════════════════════════════════════════════════════════════════
function accentFor(catalog: PosCatalog, catId: string): string {
  const i = catalog.cats.findIndex((c) => c.id === catId);
  return TILE_ACCENTS[(i < 0 ? 0 : i) % TILE_ACCENTS.length];
}

function Catalog() {
  const s = usePos();
  const catalog = useCatalog();
  const cat = s.cat || FAV_CAT;
  const gridRef = React.useRef<HTMLDivElement>(null);
  const hlRef = React.useRef<HTMLButtonElement>(null);

  const filter = s.catalogFilter;
  const q = s.search.trim().toLowerCase();
  const setCat = (id: string) => posStore.set({ cat: id, catSource: "manual", highlightId: null, catalogFilter: null, search: "" });

  type Section = { label: string | null; items?: PosMenuItem[]; combos?: PosCombo[] };
  let sections: Section[];
  if (q) {
    const hit = (p: PosMenuItem) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q);
    const items = catalog.menu.filter(hit);
    const combos = catalog.combos.filter((c) => c.name.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q));
    sections = [{ label: null, items }, ...(combos.length ? [{ label: "Combos", combos }] : [])];
  } else if (filter) {
    const set = new Set(filter.ids);
    sections = [{ label: null, items: catalog.menu.filter((p) => set.has(p.id)) }];
  } else if (cat === COMBO_CAT) sections = [{ label: null, combos: catalog.combos }];
  else if (cat === FAV_CAT) sections = [{ label: null, items: catalog.menu.filter((p) => p.fav) }];
  else {
    const items = catalog.menu.filter((p) => p.catId === cat);
    const subs = [...new Set(items.map((p) => p.sub))];
    sections = subs.map((sub) => ({ label: subs.length > 1 && sub ? sub : null, items: items.filter((p) => p.sub === sub) }));
  }
  const empty = sections.every((sec) => !(sec.items?.length || sec.combos?.length));

  React.useEffect(() => {
    if (s.highlightId && hlRef.current && gridRef.current) {
      const g = gridRef.current, el = hlRef.current;
      g.scrollTop = Math.max(0, el.offsetTop - g.offsetTop - 16);
    }
  }, [s.highlightId, cat, filter]);

  const topSuggestion = !s.aiOpen ? s.suggestions[0] : undefined;

  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: C.paper }}>
      {/* tabs */}
      <div className="pos-scroll" style={{ display: "flex", gap: 8, padding: "12px 16px 10px", overflowX: "auto", flexShrink: 0, borderBottom: `1px solid ${C.rule}` }}>
        {catalog.cats.map((c) => {
          const on = !filter && !q && cat === c.id;
          const iaOn = on && s.catSource === "ia";
          return (
            <button key={c.id} onClick={() => setCat(c.id)} style={{
              flexShrink: 0, height: 44, padding: "0 18px", borderRadius: 22, cursor: "pointer", fontFamily: F.mono, fontSize: 13, fontWeight: 600, letterSpacing: ".02em",
              border: `1.5px solid ${on ? (iaOn ? C.red : C.ink) : C.rule}`, background: on ? (iaOn ? C.red : C.ink) : C.paperLt, color: on ? C.paperLt : C.ink,
            }}>{c.label}</button>
          );
        })}
      </div>

      {/* assistant strip (drawer closed) */}
      {topSuggestion && <SuggestionStrip g={topSuggestion} more={s.suggestions.length - 1} />}

      {/* AI context banners */}
      {filter && !q && (
        <Banner onClose={() => posStore.set({ catalogFilter: null })} closeLabel="Ver todo">
          Filtrado por lo que pidió el cliente: <strong>{filter.label}</strong> · {filter.ids.length} opcion{filter.ids.length === 1 ? "" : "es"}
        </Banner>
      )}
      {!filter && !q && s.catSource === "ia" && (
        <Banner>
          El asistente abrió <strong>{catalog.catLabel[cat] ?? cat}</strong> porque lo pidió el cliente{s.highlightId ? " y dejó una opción lista 👇" : "."}
        </Banner>
      )}

      {/* grid */}
      <div ref={gridRef} className="pos-scroll" style={{ flex: 1, overflowY: "auto", padding: "14px 16px 24px" }}>
        {catalog.menu.length === 0 && catalog.combos.length === 0 ? (
          <Empty>No hay productos en el catálogo todavía.<br />Créalos en Catálogo para venderlos aquí.</Empty>
        ) : empty ? (
          <Empty>{q ? <>Nada coincide con «{s.search.trim()}».</> : cat === FAV_CAT ? <>Aún no hay favoritos.<br />Márcalos con ★ en Catálogo.</> : <>Sin productos en esta categoría.</>}</Empty>
        ) : null}
        {sections.map((sec, si) => (
          <div key={si} style={{ marginTop: si === 0 ? 0 : 18 }}>
            {sec.label && <SubLabel>{sec.label}</SubLabel>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12, alignContent: "start" }}>
              {sec.combos
                ? sec.combos.map((c) => <ComboTile key={c.id} c={c} hl={s.highlightId === c.id} hlRef={s.highlightId === c.id ? hlRef : undefined} />)
                : sec.items!.map((p) => <ProductTile key={p.id} p={p} accent={accentFor(catalog, p.catId)} hl={s.highlightId === p.id} hlRef={s.highlightId === p.id ? hlRef : undefined} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "48px 20px", textAlign: "center", color: C.muted, fontSize: 13, lineHeight: 1.7 }}>{children}</div>;
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 2px 8px", fontSize: 10, fontWeight: 600, letterSpacing: ".16em", textTransform: "uppercase", color: C.muted }}>
      <span>{children}</span>
      <span style={{ flex: 1, borderTop: `1px dashed ${C.rule}` }} />
    </div>
  );
}

function Banner({ children, onClose, closeLabel }: { children: React.ReactNode; onClose?: () => void; closeLabel?: string }) {
  return (
    <div className="pos-card" style={{ margin: "10px 16px 0", display: "flex", alignItems: "center", gap: 9, padding: "8px 12px", border: `1px solid ${C.red}`, background: C.paperLt, borderRadius: 3 }}>
      <span style={{ width: 18, height: 18, borderRadius: 18, border: `1.5px solid ${C.red}`, color: C.red, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, flexShrink: 0 }}>IA</span>
      <span style={{ flex: 1, fontSize: 11.5, color: C.ink2, lineHeight: 1.4 }}>{children}</span>
      {onClose && (
        <button onClick={onClose} style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: C.red, border: `1px solid ${C.red}`, background: "transparent", padding: "5px 9px", borderRadius: 2, cursor: "pointer", flexShrink: 0 }}>
          {closeLabel} ✕
        </button>
      )}
    </div>
  );
}

function ProductTile({ p, accent, hl, hlRef }: { p: PosMenuItem; accent: string; hl: boolean; hlRef?: React.Ref<HTMLButtonElement> }) {
  const out = p.stock === "sin";
  return (
    <button ref={hlRef} disabled={out} onClick={() => tapItem(p.id)} className={"pos-tile" + (hl ? " pos-hl" : "")} title={p.desc || p.name} style={{
      textAlign: "left", padding: "12px 12px 10px", borderRadius: 6, cursor: out ? "not-allowed" : "pointer", minHeight: 112, position: "relative", overflow: "hidden",
      border: `1.5px solid ${hl ? C.red : C.rule}`, background: hl ? C.paperLt : out ? C.paperDk : C.paperLt, opacity: out ? 0.55 : 1, display: "flex", flexDirection: "column",
    }}>
      <span aria-hidden style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 5, background: hl ? C.red : accent, opacity: 0.85 }} />
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6, paddingLeft: 4 }}>
        <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.25, color: C.ink, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.name}</span>
        {p.mods.length > 0 && !out && <span title="Con opciones" style={{ fontSize: 10, color: C.muted, flexShrink: 0, marginTop: 2 }}>▾</span>}
      </div>
      <div style={{ marginTop: "auto", paddingTop: 10, paddingLeft: 4, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <span className="cmd-num" style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>{posMoney(p.price)}</span>
        {out ? <Stamp size={9} rotate={-6}>Agotado</Stamp>
          : hl ? <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".08em", color: C.paperLt, background: C.red, padding: "3px 7px", borderRadius: 2 }}>★ SUGERIDO</span>
          : p.stock === "bajo" ? <span style={{ fontSize: 9, letterSpacing: ".08em", color: C.amber }}>● bajo</span>
          : null}
      </div>
    </button>
  );
}

function ComboTile({ c, hl, hlRef }: { c: PosCombo; hl: boolean; hlRef?: React.Ref<HTMLButtonElement> }) {
  return (
    <button ref={hlRef} onClick={() => addCombo(c.id)} className={"pos-tile" + (hl ? " pos-hl" : "")} style={{
      textAlign: "left", padding: "12px 14px 10px", borderRadius: 6, cursor: "pointer", gridColumn: "span 2", minHeight: 112, position: "relative", overflow: "hidden",
      border: `1.5px solid ${hl ? C.red : C.green}`, background: C.paperLt, display: "flex", flexDirection: "column",
    }}>
      <span aria-hidden style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 5, background: hl ? C.red : C.green }} />
      <div style={{ paddingLeft: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".1em", color: C.green, border: `1px solid ${C.green}`, padding: "1px 5px", borderRadius: 2 }}>COMBO</span>
          <span style={{ fontSize: 14.5, fontWeight: 700, color: C.ink }}>{c.name}</span>
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 4, lineHeight: 1.35 }}>{c.desc}</div>
      </div>
      <div style={{ marginTop: "auto", paddingTop: 10, paddingLeft: 4, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span className="cmd-num" style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>{posMoney(c.price)}</span>
        {c.saving > 0 && <span style={{ fontSize: 10, color: C.green, letterSpacing: ".04em" }}>AHORRA {posMoney(c.saving)}</span>}
      </div>
    </button>
  );
}

/** Slim strip showing the assistant's top suggestion while the drawer is closed. */
function SuggestionStrip({ g, more }: { g: SuggestionCardState; more: number }) {
  const col = KIND_COLOR[g.kind] || KIND_COLOR.pedido;
  const accent = col.line === C.paperLt ? C.ink : col.line;
  return (
    <div className="pos-card" style={{ margin: "10px 16px 0", display: "flex", alignItems: "center", gap: 10, padding: "8px 10px 8px 12px", border: `1px solid ${C.rule}`, borderLeft: `4px solid ${accent}`, background: C.paperLt, borderRadius: 3 }}>
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: col.tag, border: `1px solid ${col.tag}`, padding: "2px 6px", borderRadius: 2, flexShrink: 0 }}>{POS_KIND_LABEL[g.kind] || "Idea"}</span>
      <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: C.ink, lineHeight: 1.3, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.title}</span>
      {g.actionLabel && g.act && (
        <button onClick={() => { applyAct(g.act); dismissSuggestion(g.uid, true); }} style={{ height: 32, padding: "0 12px", borderRadius: 3, border: "none", background: C.ink, color: C.paperLt, fontFamily: F.mono, fontSize: 11, fontWeight: 600, cursor: "pointer", flexShrink: 0, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.actionLabel}</button>
      )}
      <button onClick={() => posStore.set({ aiOpen: true })} style={{ height: 32, padding: "0 10px", borderRadius: 3, border: `1px solid ${C.rule}`, background: "transparent", color: C.ink2, fontFamily: F.mono, fontSize: 10.5, cursor: "pointer", flexShrink: 0 }}>
        {more > 0 ? `+${more} más` : "Ver"}
      </button>
      <button onClick={() => dismissSuggestion(g.uid, false)} aria-label="Descartar" style={{ width: 28, height: 28, border: "none", background: "transparent", color: C.muted, fontSize: 16, cursor: "pointer", flexShrink: 0 }}>×</button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Ticket
// ════════════════════════════════════════════════════════════════
const ORDER_TYPES = [
  { id: "aqui", label: "Aquí" },
  { id: "llevar", label: "Llevar" },
  { id: "domicilio", label: "Domicilio" },
] as const;

const qtyBtn: React.CSSProperties = { width: 34, height: 34, border: `1.5px solid ${C.ink}`, background: C.paperLt, color: C.ink, fontFamily: F.mono, fontSize: 18, lineHeight: 1, cursor: "pointer", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };

function Ticket() {
  const s = usePos();
  const catalog = useCatalog();
  const total = orderTotal(s.order, catalog);
  const editing = s.pending?.mode === "edit" ? s.pending : null;
  const hasMissing = s.order.some((l) => l.missing);
  const canSend = s.order.length > 0 && !s.sending && !hasMissing;
  const count = s.order.reduce((n, l) => n + l.qty, 0);
  const comboSaved = s.order.filter((l) => l.kind === "combo").reduce((acc, l) => acc + (catalog.comboById[l.id]?.saving ?? 0) * l.qty, 0);
  const [noteOpen, setNoteOpen] = React.useState(false);
  const listRef = React.useRef<HTMLDivElement>(null);
  const prevCount = React.useRef(s.order.length);
  React.useEffect(() => {
    if (s.order.length > prevCount.current && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    prevCount.current = s.order.length;
  }, [s.order.length]);

  return (
    <div className="pos-ticket" style={{ width: TICKET_W, flexShrink: 0, display: "flex", flexDirection: "column", borderLeft: `1.5px solid ${C.ink}`, background: C.paperLt }}>
      {/* header */}
      <div style={{ padding: "12px 14px 10px", borderBottom: `1px solid ${C.rule}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".14em", color: editing ? C.red : C.ink }}>
            {editing ? <>EDITANDO <span className="cmd-num">{editing.folio}</span></> : "PEDIDO"}
            {count > 0 && <span className="cmd-num" style={{ color: C.muted, fontWeight: 400 }}> · {count} ítem{count === 1 ? "" : "s"}</span>}
          </span>
          {editing ? (
            <button onClick={() => { if (window.confirm(`¿Descartar los cambios del pedido ${editing.folio}?`)) discardPendingEdit(); }} style={{ background: "none", border: "none", color: C.muted, fontFamily: F.mono, fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer", padding: "4px 0" }}>Descartar</button>
          ) : s.order.length > 0 && (
            <button onClick={() => { if (window.confirm("¿Vaciar el pedido?")) clearTicket(); }} style={{ background: "none", border: "none", color: C.muted, fontFamily: F.mono, fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer", padding: "4px 0" }}>Vaciar</button>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {ORDER_TYPES.map((t) => {
            const on = s.orderType === t.id;
            return (
              <button key={t.id} onClick={() => posStore.set({ orderType: t.id })} style={{
                flex: 1, height: 38, fontFamily: F.mono, fontSize: 12, fontWeight: 600, cursor: "pointer", borderRadius: 4,
                border: `1.5px solid ${on ? C.ink : C.rule}`, background: on ? C.ink : "transparent", color: on ? C.paperLt : C.ink2,
              }}>{t.label}</button>
            );
          })}
        </div>
        <input
          value={s.customerName}
          onChange={(e) => posStore.set({ customerName: e.target.value })}
          placeholder="Nombre del cliente (opcional)"
          aria-label="Nombre del cliente"
          maxLength={80}
          style={{ marginTop: 8, width: "100%", height: 36, padding: "0 10px", border: `1px solid ${C.rule}`, background: C.paper, color: C.ink, fontFamily: F.mono, fontSize: 13, borderRadius: 4, outline: "none" }}
        />
      </div>

      {/* lines */}
      <div ref={listRef} className="pos-scroll" style={{ flex: 1, overflowY: "auto" }}>
        {s.order.length === 0 && (
          <div style={{ padding: "56px 24px", textAlign: "center", color: C.muted, fontSize: 13, lineHeight: 1.7 }}>
            Toca un producto<br />para empezar el pedido.
          </div>
        )}
        {s.order.map((l, i) => <TicketLine key={i} idx={i} line={l} />)}
      </div>

      {/* footer */}
      <div style={{ borderTop: `1.5px solid ${C.ink}`, padding: "10px 14px 14px", background: C.paperLt }}>
        {s.noteSinGluten && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, fontSize: 10.5, color: C.green, border: `1px solid ${C.green}`, padding: "5px 8px", letterSpacing: ".04em", borderRadius: 3 }}>
            <span>✓ PEDIDO «SIN GLUTEN»</span>
            <button onClick={() => posStore.set({ noteSinGluten: false })} style={{ background: "none", border: "none", color: C.green, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>×</button>
          </div>
        )}
        {noteOpen || s.note ? (
          <textarea
            value={s.note}
            onChange={(e) => posStore.set({ note: e.target.value })}
            placeholder="Nota para cocina / barra…"
            aria-label="Nota del pedido"
            rows={2}
            maxLength={500}
            style={{ width: "100%", marginBottom: 8, padding: "8px 10px", border: `1px solid ${C.rule}`, background: C.paper, color: C.ink, fontFamily: F.mono, fontSize: 12.5, borderRadius: 4, outline: "none", resize: "none" }}
          />
        ) : null}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: C.muted, marginBottom: 4 }}>
          <button onClick={() => setNoteOpen((v) => !v)} style={{ background: "none", border: "none", color: C.ink2, fontFamily: F.mono, fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", cursor: "pointer", padding: 0 }}>
            {noteOpen || s.note ? "− Nota" : "+ Nota"}
          </button>
          {comboSaved > 0 && <span style={{ color: C.green }}>Ahorro en combos <span className="cmd-num">−{posMoney(comboSaved)}</span></span>}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "6px 0 10px" }}>
          <span style={{ fontSize: 12, letterSpacing: ".12em", color: C.ink2 }}>TOTAL</span>
          <span className="cmd-num" style={{ fontFamily: F.slab, fontSize: 32, color: C.ink, lineHeight: 1 }}>{posMoney(total)}</span>
        </div>
        {hasMissing && (
          <div style={{ fontSize: 10.5, color: C.red, marginBottom: 8, lineHeight: 1.4 }}>Quita el producto no disponible para continuar.</div>
        )}
        {s.sendError && s.view === "sale" && (
          <div role="alert" style={{ fontSize: 11, color: C.red, marginBottom: 8, lineHeight: 1.4 }}>{s.sendError}</div>
        )}
        <button
          className="cmd-btn red"
          disabled={!canSend}
          onClick={startTender}
          style={{ width: "100%", height: 60, fontSize: 15, fontWeight: 600, letterSpacing: ".06em", opacity: canSend ? 1 : 0.4, cursor: canSend ? "pointer" : "not-allowed" }}
        >
          Cobrar {s.order.length ? posMoney(total) : ""}
        </button>
        <button
          className="cmd-btn"
          disabled={!canSend}
          onClick={() => void savePending()}
          style={{ width: "100%", height: 48, marginTop: 8, fontSize: 13, fontWeight: 600, letterSpacing: ".06em", opacity: canSend ? 1 : 0.4, cursor: canSend ? "pointer" : "not-allowed" }}
        >
          {s.sending ? "Guardando…" : editing ? "Guardar cambios" : "Enviar · pagar después"}
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Pedidos — Square-style cards: open queue + per-day history
// ════════════════════════════════════════════════════════════════
const ORDER_TABS: { id: OrdersTab; label: string }[] = [
  { id: "pendiente", label: "Pendientes" },
  { id: "pagada", label: "Pagadas" },
  { id: "cancelada", label: "Canceladas" },
  { id: "todas", label: "Todas" },
];
const STATUS_UI: Record<PosOrder["status"], { label: string; color: string }> = {
  pendiente: { label: "Pendiente", color: C.amber },
  pagada: { label: "Pagada", color: C.green },
  cancelada: { label: "Cancelada", color: C.muted },
};

function OrdenesScreen() {
  const s = usePos();
  const [, tick] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    const id = window.setInterval(() => { tick(); if (document.visibilityState === "visible") void refreshOrdenes(); }, 30_000);
    return () => window.clearInterval(id);
  }, []);
  const today = bogotaDay();
  const isQueue = s.ordenesTab === "pendiente";
  const sel = s.ordenSel ? s.ordenes.find((o) => o.id === s.ordenSel) ?? null : null;
  const total = s.ordenes.filter((o) => o.status === "pagada").reduce((n, o) => n + o.total, 0);

  return (
    <Overlay align="fill">
      <div role="region" aria-label="Pedidos" style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
        <div style={{ height: 58, display: "flex", alignItems: "center", gap: 14, padding: "0 16px", borderBottom: `1.5px solid ${C.ink}`, background: C.paperLt, flexShrink: 0 }}>
          <button onClick={closeOrdenes} style={{ height: 40, padding: "0 14px", borderRadius: 3, border: `1.5px solid ${C.rule}`, background: "transparent", color: C.ink, fontFamily: F.mono, fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer" }}>← Volver</button>
          <span style={{ fontFamily: F.slab, fontSize: 22 }}>Pedidos<span style={{ color: C.amber }}>.</span></span>
          <div role="tablist" style={{ display: "flex", gap: 6, marginLeft: 10 }}>
            {ORDER_TABS.map((t) => {
              const on = s.ordenesTab === t.id;
              const n = t.id === "pendiente" ? s.pendientes.length : 0;
              return (
                <button key={t.id} role="tab" aria-selected={on} onClick={() => setOrdenesTab(t.id)} style={{ height: 36, padding: "0 12px", borderRadius: 3, cursor: "pointer", border: `1.5px solid ${on ? C.ink : C.rule}`, background: on ? C.ink : "transparent", color: on ? C.paperLt : C.ink2, fontFamily: F.mono, fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", display: "inline-flex", alignItems: "center", gap: 6 }}>
                  {t.label}
                  {n > 0 && <span className="cmd-num" style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: C.amber, color: "#fff", fontSize: 10, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{n}</span>}
                </button>
              );
            })}
          </div>
          {!isQueue && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 12 }}>
              <button onClick={() => setOrdenesDay(shiftDay(s.ordenesDay, -1))} aria-label="Día anterior" style={dayBtn}>◀</button>
              <span style={{ fontSize: 12, fontWeight: 600, minWidth: 150, textAlign: "center" }}>{dayLabel(s.ordenesDay, today)}</span>
              <button onClick={() => setOrdenesDay(shiftDay(s.ordenesDay, 1))} disabled={s.ordenesDay >= today} aria-label="Día siguiente" style={{ ...dayBtn, opacity: s.ordenesDay >= today ? 0.35 : 1 }}>▶</button>
              {s.ordenesDay !== today && <button onClick={() => setOrdenesDay(today)} style={{ ...dayBtn, width: "auto", padding: "0 10px", fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase" }}>Hoy</button>}
            </div>
          )}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14, fontSize: 11, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase" }}>
            {!isQueue && total > 0 && <span>Ventas <span className="cmd-num" style={{ color: C.ink }}>{posMoney(total)}</span></span>}
            <span className="cmd-num">{s.ordenes.length} pedido{s.ordenes.length === 1 ? "" : "s"}</span>
            <button onClick={() => void refreshOrdenes()} aria-label="Actualizar" title="Actualizar" style={dayBtn}>{s.ordenesLoading ? "…" : "↻"}</button>
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          <div className="pos-scroll" style={{ flex: 1, overflowY: "auto", padding: 16 }}>
            {s.ordenesError && <div role="alert" style={{ color: C.red, fontSize: 12, marginBottom: 12 }}>{s.ordenesError}</div>}
            {!s.ordenes.length && !s.ordenesError && (
              <div style={{ padding: "64px 24px", textAlign: "center", color: C.muted, fontSize: 13, lineHeight: 1.7 }}>
                {s.ordenesLoading ? "Cargando…" : isQueue ? <>No hay pedidos pendientes.<br />Usa «Enviar · pagar después» en el ticket.</> : "Sin pedidos ese día."}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
              {s.ordenes.map((o) => <OrdenCard key={o.id} o={o} selected={o.id === s.ordenSel} />)}
            </div>
          </div>
          {sel && <OrdenDetail o={sel} />}
        </div>
      </div>
    </Overlay>
  );
}

const dayBtn: React.CSSProperties = { width: 36, height: 36, borderRadius: 3, border: `1.5px solid ${C.rule}`, background: "transparent", color: C.ink, fontFamily: F.mono, fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" };

function OrdenCard({ o, selected }: { o: PosOrder; selected: boolean }) {
  const st = STATUS_UI[o.status];
  const type = ORDER_TYPES.find((t) => t.id === o.orderType)?.label ?? o.orderType;
  const count = o.items.reduce((n, it) => n + it.qty, 0);
  return (
    <button
      onClick={() => selectOrden(o.id)}
      aria-pressed={selected}
      aria-label={`Pedido ${o.folio}`}
      className="pos-card"
      style={{ textAlign: "left", padding: "12px 14px", borderRadius: 8, cursor: "pointer", border: `1.5px solid ${selected ? C.ink : C.rule}`, boxShadow: selected ? `0 0 0 2px ${C.ink}` : "none", background: C.paperLt, color: C.ink, fontFamily: F.mono, display: "flex", flexDirection: "column", gap: 6, opacity: o.status === "cancelada" ? 0.6 : 1 }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span className="cmd-num" style={{ fontFamily: F.slab, fontSize: 24, lineHeight: 1 }}>{o.folio}</span>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: st.color, border: `1px solid ${st.color}`, padding: "2px 6px", borderRadius: 3 }}>{st.label}</span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.customerName || "—"}</div>
      <div style={{ fontSize: 11, color: C.muted }}>
        {type} · <span className="cmd-num">{count}</span> ítem{count === 1 ? "" : "s"} · {o.status === "pendiente" ? timeAgo(o.createdAt) : bogotaTime(o.createdAt)}
      </div>
      <div style={{ fontSize: 11, color: C.ink2, lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
        {o.items.map((it) => `${it.qty}× ${it.name}`).join(" · ")}
      </div>
      <div className="cmd-num" style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>{posMoney(o.total)}</div>
    </button>
  );
}

function OrdenDetail({ o }: { o: PosOrder }) {
  const s = usePos();
  const p = usePrinter();
  const st = STATUS_UI[o.status];
  const type = ORDER_TYPES.find((t) => t.id === o.orderType)?.label ?? o.orderType;
  const method = o.paymentMethod ? PAY_METHODS.find((m) => m.id === o.paymentMethod)?.label ?? o.paymentMethod : null;
  // Loading something into the ticket discards what's there — ask first.
  const guard = () => !s.order.length || !!s.pending || window.confirm("Se perderá el pedido actual. ¿Continuar?");
  const row = (k: string, v: React.ReactNode) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, padding: "5px 0", borderBottom: `1px dashed ${C.ruleSoft}` }}>
      <span style={{ color: C.muted, letterSpacing: ".08em", textTransform: "uppercase", fontSize: 10.5 }}>{k}</span>
      <span style={{ color: C.ink, textAlign: "right" }}>{v}</span>
    </div>
  );
  return (
    <div role="complementary" aria-label={`Detalle ${o.folio}`} style={{ width: 380, flexShrink: 0, borderLeft: `1.5px solid ${C.ink}`, background: C.paperLt, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "18px 20px 12px", borderBottom: `1px solid ${C.rule}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="cmd-num" style={{ fontFamily: F.slab, fontSize: 34, lineHeight: 1 }}>{o.folio}</span>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: st.color, border: `1px solid ${st.color}`, padding: "3px 7px", borderRadius: 3 }}>{st.label}</span>
          <button onClick={() => selectOrden(null)} aria-label="Cerrar detalle" style={{ marginLeft: "auto", width: 32, height: 32, border: `1.5px solid ${C.rule}`, borderRadius: 3, background: "transparent", color: C.ink, fontSize: 16, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, marginTop: 8 }}>{o.customerName || "Sin nombre"}</div>
      </div>
      <div className="pos-scroll" style={{ flex: 1, overflowY: "auto", padding: "10px 20px" }}>
        {row("Tipo", type)}
        {row("Enviado", `${bogotaTime(o.createdAt)} · ${timeAgo(o.createdAt)}`)}
        {o.paidAt && row("Pagado", bogotaTime(o.paidAt))}
        {method && row("Pago", method)}
        {o.paymentMethod === "efectivo" && o.tendered !== null && row("Recibido / cambio", <><span className="cmd-num">{posMoney(o.tendered)}</span> / <span className="cmd-num" style={{ color: C.green }}>{posMoney(o.change)}</span></>)}
        {o.sinGluten && row("Nota", "Sin gluten")}
        {o.note && row("Nota", o.note)}
        <div style={{ marginTop: 12 }}>
          {o.items.map((it) => (
            <div key={it.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "7px 0", borderBottom: `1px dashed ${C.ruleSoft}`, fontSize: 12.5 }}>
              <span style={{ color: C.ink2, minWidth: 0 }}><span className="cmd-num" style={{ color: C.muted }}>{it.qty}×</span> {it.name}</span>
              <span className="cmd-num" style={{ color: C.ink, flexShrink: 0 }}>{posMoney(it.unitPrice * it.qty)}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 12 }}>
          <span style={{ fontSize: 11, letterSpacing: ".12em", color: C.ink2 }}>TOTAL</span>
          <span className="cmd-num" style={{ fontFamily: F.slab, fontSize: 28 }}>{posMoney(o.total)}</span>
        </div>
      </div>
      <div style={{ padding: "12px 20px 16px", borderTop: `1.5px solid ${C.ink}`, display: "flex", flexDirection: "column", gap: 8 }}>
        {o.status === "pendiente" && (
          <>
            <button className="cmd-btn red" onClick={() => { if (guard()) chargePending(o); }} style={{ width: "100%", height: 52, fontSize: 14 }}>Cobrar {posMoney(o.total)}</button>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="cmd-btn" onClick={() => { if (guard()) editPending(o); }} style={{ flex: 1, height: 44, fontSize: 12 }}>Editar</button>
              <button onClick={() => { if (window.confirm(`¿Cancelar el pedido ${o.folio}?`)) void cancelPending(o.id); }} aria-label={`Cancelar ${o.folio}`} style={{ flex: 1, height: 44, border: `1.5px solid ${C.rule}`, borderRadius: 3, background: "transparent", color: C.muted, fontFamily: F.mono, fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer" }}>Cancelar</button>
            </div>
          </>
        )}
        {p.status !== "unsupported" && (
          <button onClick={() => printLabelFor(o)} disabled={p.status !== "ready"} style={{ width: "100%", height: 40, border: `1.5px solid ${C.rule}`, borderRadius: 3, background: "transparent", color: C.ink, fontFamily: F.mono, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", cursor: p.status === "ready" ? "pointer" : "default", opacity: p.status === "ready" ? 1 : 0.5 }}>
            Reimprimir etiqueta
          </button>
        )}
      </div>
    </div>
  );
}

function TicketLine({ idx, line }: { idx: number; line: OrderLine }) {
  const catalog = useCatalog();
  const unit = modLinePrice(line, catalog);
  const mods = modSummary(line, catalog);
  const editable = line.kind === "item" && !!line.hasMods;
  const open = () => { if (editable) posStore.set({ sheet: { mode: "edit", idx } }); };
  return (
    <div className={editable ? "pos-line" : undefined} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px 10px 14px", borderBottom: `1px solid ${C.ruleSoft}`, opacity: line.missing ? 0.55 : 1 }}>
      <div role={editable ? "button" : undefined} tabIndex={editable ? 0 : undefined} onClick={open} onKeyDown={(e) => { if (editable && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(); } }} style={{ flex: 1, minWidth: 0, cursor: editable ? "pointer" : "default" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {line.kind === "combo" && <span style={{ fontSize: 8, color: C.green, border: `1px solid ${C.green}`, padding: "1px 3px", letterSpacing: ".06em", borderRadius: 2 }}>COMBO</span>}
          {line.missing && <span style={{ fontSize: 8, color: C.red, border: `1px solid ${C.red}`, padding: "1px 3px", letterSpacing: ".06em", borderRadius: 2 }}>NO DISPONIBLE</span>}
          <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line.name}</span>
        </div>
        {line.kind === "combo" && <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{catalog.comboById[line.id]?.desc}</div>}
        {mods.length > 0 && (
          <div style={{ fontSize: 11, color: C.ink2, marginTop: 3, lineHeight: 1.4 }}>
            {mods.map((m) => m.name + (m.delta > 0 ? ` (+${posMoney(m.delta)})` : "")).join(" · ")}
          </div>
        )}
        <div style={{ fontSize: 10.5, color: C.muted, marginTop: 3 }}>
          <span className="cmd-num">{posMoney(unit)}</span> c/u{editable && <span style={{ color: C.red, marginLeft: 8 }}>editar ▸</span>}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button onClick={() => changeQty(idx, -1)} aria-label={line.qty === 1 ? "Quitar" : "Quitar uno"} style={qtyBtn}>{line.qty === 1 ? "×" : "−"}</button>
        <span className="cmd-num" style={{ fontSize: 15, fontWeight: 700, minWidth: 22, textAlign: "center" }}>{line.qty}</span>
        <button onClick={() => changeQty(idx, +1)} aria-label="Agregar uno" style={qtyBtn}>+</button>
      </div>
      <div className="cmd-num" style={{ fontSize: 14, fontWeight: 700, color: C.ink, minWidth: 70, textAlign: "right" }}>{posMoney(unit * line.qty)}</div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Item sheet — modifiers + qty (add or edit)
// ════════════════════════════════════════════════════════════════
function ItemSheet() {
  const s = usePos();
  const catalog = useCatalog();
  const sheet = s.sheet!;
  const line = sheet.mode === "edit" ? s.order[sheet.idx] : undefined;
  const productId = sheet.mode === "add" ? sheet.productId : line?.id;
  const p = productId ? catalog.byId[productId] : undefined;

  const [mods, setMods] = React.useState<ModSelection>(() => (line?.mods ? { ...line.mods } : p ? posDefaultMods(p, catalog) : {}));
  const [qty, setQty] = React.useState(line?.qty ?? 1);
  const close = () => posStore.set({ sheet: null });

  React.useEffect(() => {
    if (!p) close();
  }, [p]);
  if (!p) return null;

  const groups = p.mods.map((gid) => catalog.modGroups[gid]).filter((g): g is PosModGroup => !!g);
  const missing = groups.filter((g) => g.required && g.type === "single" && !mods[g.id]);
  const unit = modLinePrice({ id: p.id, name: p.name, qty: 1, kind: "item", basePrice: p.price, mods }, catalog);
  const commit = () => {
    if (missing.length) return;
    if (sheet.mode === "add") addLineWithMods(p.id, mods, qty);
    else replaceLine(sheet.idx, mods, qty);
  };

  return (
    <Overlay onClose={close} align="center">
      <div role="dialog" aria-modal aria-label={p.name} style={{ width: "min(600px, 94vw)", maxHeight: "88dvh", display: "flex", flexDirection: "column", background: C.paperLt, border: `1.5px solid ${C.ink}`, borderRadius: 8, boxShadow: "0 30px 80px -30px rgba(0,0,0,.55)", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px 12px", borderBottom: `1px solid ${C.rule}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: F.slab, fontSize: 24, lineHeight: 1.1, color: C.ink }}>{p.name}</div>
            {p.desc && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4, lineHeight: 1.4 }}>{p.desc}</div>}
          </div>
          <button onClick={close} aria-label="Cerrar" style={{ width: 36, height: 36, borderRadius: 18, border: `1px solid ${C.rule}`, background: "transparent", color: C.ink2, fontSize: 18, cursor: "pointer", flexShrink: 0 }}>×</button>
        </div>

        <div className="pos-scroll" style={{ flex: 1, overflowY: "auto", padding: "8px 20px 12px" }}>
          {groups.length === 0 && <div style={{ padding: "16px 0", color: C.muted, fontSize: 12 }}>Este producto no tiene opciones.</div>}
          {groups.map((g) => {
            const sel = mods[g.id];
            const isSel = (name: string) => (g.type === "single" ? sel === name : Array.isArray(sel) && sel.includes(name));
            const pick = (name: string) => setMods((m) => {
              if (g.type === "single") return { ...m, [g.id]: m[g.id] === name && !g.required ? null : name };
              const cur = Array.isArray(m[g.id]) ? (m[g.id] as string[]) : [];
              return { ...m, [g.id]: cur.includes(name) ? cur.filter((x) => x !== name) : [...cur, name] };
            });
            return (
              <div key={g.id} style={{ marginTop: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: C.ink }}>{g.name}</span>
                  <span style={{ fontSize: 9.5, color: g.required && !sel ? C.red : C.muted, letterSpacing: ".04em" }}>
                    {g.required ? "obligatorio" : "opcional"} · {g.type === "single" ? "elige una" : "elige varias"}
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
                  {g.options.map((o) => {
                    const on = isSel(o.name);
                    return (
                      <button key={o.name} onClick={() => pick(o.name)} aria-pressed={on} style={{
                        minHeight: 46, padding: "8px 12px", borderRadius: 5, cursor: "pointer", textAlign: "left",
                        border: `1.5px solid ${on ? C.ink : C.rule}`, background: on ? C.ink : C.paper, color: on ? C.paperLt : C.ink,
                        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontFamily: F.mono, fontSize: 13,
                      }}>
                        <span>{o.name}</span>
                        {o.delta > 0 && <span className="cmd-num" style={{ fontSize: 11, color: on ? C.paperLt : C.green, opacity: on ? 0.85 : 1 }}>+{posMoney(o.delta)}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ borderTop: `1.5px solid ${C.ink}`, padding: "12px 20px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => setQty((q) => Math.max(sheet.mode === "edit" ? 0 : 1, q - 1))} aria-label="Menos" style={{ ...qtyBtn, width: 44, height: 44 }}>−</button>
            <span className="cmd-num" style={{ fontSize: 20, fontWeight: 700, minWidth: 34, textAlign: "center" }}>{qty}</span>
            <button onClick={() => setQty((q) => Math.min(99, q + 1))} aria-label="Más" style={{ ...qtyBtn, width: 44, height: 44 }}>+</button>
          </div>
          {sheet.mode === "edit" && (
            <button onClick={() => removeLine(sheet.idx)} style={{ height: 44, padding: "0 14px", borderRadius: 4, border: `1.5px solid ${C.red}`, background: "transparent", color: C.red, fontFamily: F.mono, fontSize: 12, letterSpacing: ".06em", textTransform: "uppercase", cursor: "pointer" }}>Quitar</button>
          )}
          <button
            className="cmd-btn"
            onClick={commit}
            disabled={missing.length > 0}
            style={{ flex: 1, height: 52, fontSize: 14, marginLeft: "auto", minWidth: 220, opacity: missing.length ? 0.45 : 1 }}
          >
            {missing.length ? `Elige ${missing[0].name.toLowerCase()}` : sheet.mode === "add" ? `Agregar · ${posMoney(unit * qty)}` : qty === 0 ? "Quitar del pedido" : `Guardar · ${posMoney(unit * qty)}`}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function Overlay({ children, onClose, align }: { children: React.ReactNode; onClose?: () => void; align: "center" | "fill" }) {
  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }} style={{ position: "absolute", inset: 0, zIndex: 40, background: align === "fill" ? C.paper : "rgba(20,14,8,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: align === "fill" ? 0 : 16 }}>
      {children}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Tender — choose payment, cash keypad, confirm
// ════════════════════════════════════════════════════════════════
/** Handy cash amounts above the total: exact + round bills (COP). */
function quickAmounts(total: number): number[] {
  const steps = [5000, 10000, 20000, 50000, 100000]; // Colombian bills
  const out = new Set<number>([total]);
  for (const st of steps) {
    const up = Math.ceil(total / st) * st;
    if (up > total) out.add(up);
  }
  return [...out].sort((a, b) => a - b).slice(0, 6);
}

function TenderScreen() {
  const s = usePos();
  const catalog = useCatalog();
  const total = ticketTotal(s);
  const isCash = s.payMethod === "efectivo";
  const tendered = s.tendered;
  const change = tendered !== null ? tendered - total : 0;
  const short = isCash && tendered !== null && tendered < total;
  const canConfirm = !s.sending && s.order.length > 0 && (!isCash || (tendered !== null && tendered >= total));

  const setMethod = (m: PayMethod) => posStore.set({ payMethod: m, sendError: null });
  const setTendered = (n: number | null) => posStore.set({ tendered: n, sendError: null });
  const key = (k: string) => {
    const cur = tendered ?? 0;
    if (k === "⌫") return setTendered(cur >= 10 ? Math.floor(cur / 10) : null);
    if (k === "C") return setTendered(null);
    const next = Number(String(cur) + k);
    if (next <= 99_999_999) setTendered(next);
  };

  // Enter confirms, digits type into the keypad.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && canConfirm) void completeSale();
      else if (isCash && /^[0-9]$/.test(e.key)) key(e.key);
      else if (isCash && e.key === "Backspace") key("⌫");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <Overlay align="fill">
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
        <div style={{ height: 58, display: "flex", alignItems: "center", gap: 14, padding: "0 16px", borderBottom: `1.5px solid ${C.ink}`, background: C.paperLt, flexShrink: 0 }}>
          <button onClick={cancelTender} style={{ height: 40, padding: "0 14px", borderRadius: 3, border: `1.5px solid ${C.rule}`, background: "transparent", color: C.ink, fontFamily: F.mono, fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer" }}>← Volver</button>
          <span style={{ fontFamily: F.slab, fontSize: 22 }}>Cobrar<span style={{ color: C.red }}>.</span></span>
          <span style={{ marginLeft: "auto", fontSize: 11, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase" }}>
            {s.pending ? <>Pedido <span className="cmd-num" style={{ color: C.ink }}>{s.pending.folio}</span> · </> : null}
            {ORDER_TYPES.find((t) => t.id === s.orderType)?.label}{s.customerName ? ` · ${s.customerName}` : ""}
          </span>
        </div>

        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          {/* summary */}
          <div style={{ width: 360, flexShrink: 0, borderRight: `1.5px solid ${C.ink}`, background: C.paperLt, display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "22px 20px 16px", borderBottom: `1px solid ${C.rule}` }}>
              <div style={{ fontSize: 11, letterSpacing: ".14em", color: C.muted, textTransform: "uppercase" }}>Total a cobrar</div>
              <div className="cmd-num" style={{ fontFamily: F.slab, fontSize: 46, lineHeight: 1.05, color: C.ink, marginTop: 4 }}>{posMoney(total)}</div>
            </div>
            <div className="pos-scroll" style={{ flex: 1, overflowY: "auto", padding: "8px 20px" }}>
              {s.order.map((l, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "7px 0", borderBottom: `1px dashed ${C.ruleSoft}`, fontSize: 12.5 }}>
                  <span style={{ color: C.ink2, minWidth: 0 }}><span className="cmd-num" style={{ color: C.muted }}>{l.qty}×</span> {l.name}</span>
                  <span className="cmd-num" style={{ color: C.ink, flexShrink: 0 }}>{posMoney(modLinePrice(l, catalog) * l.qty)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* tender */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "20px 28px", overflowY: "auto" }} className="pos-scroll">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {PAY_METHODS.map((m) => {
                const on = s.payMethod === m.id;
                return (
                  <button key={m.id} onClick={() => setMethod(m.id)} aria-pressed={on} style={{
                    height: 72, borderRadius: 6, cursor: "pointer", textAlign: "left", padding: "0 16px",
                    border: `1.5px solid ${on ? C.ink : C.rule}`, background: on ? C.ink : C.paperLt, color: on ? C.paperLt : C.ink,
                    display: "flex", flexDirection: "column", justifyContent: "center", gap: 3, fontFamily: F.mono,
                  }}>
                    <span style={{ fontSize: 15, fontWeight: 700 }}>{m.label}</span>
                    <span style={{ fontSize: 10.5, opacity: 0.7 }}>{m.hint}</span>
                  </button>
                );
              })}
            </div>

            {isCash ? (
              <div style={{ marginTop: 18, display: "flex", gap: 20, flex: 1, minHeight: 0 }}>
                <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                  <div style={{ fontSize: 10.5, letterSpacing: ".14em", color: C.muted, textTransform: "uppercase", marginBottom: 8 }}>Recibido</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                    {quickAmounts(total).map((a, i) => {
                      const on = tendered === a;
                      return (
                        <button key={a} onClick={() => setTendered(a)} style={{
                          height: 44, padding: "0 14px", borderRadius: 22, cursor: "pointer", fontFamily: F.mono, fontSize: 13, fontWeight: 600,
                          border: `1.5px solid ${on ? C.ink : C.rule}`, background: on ? C.ink : C.paperLt, color: on ? C.paperLt : C.ink,
                        }}>{i === 0 ? `Exacto · ${posMoney(a)}` : posMoney(a)}</button>
                      );
                    })}
                  </div>
                  <div style={{ border: `1.5px solid ${short ? C.red : C.ink}`, borderRadius: 6, padding: "12px 16px", background: C.paperLt, display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                    <span style={{ fontSize: 11, letterSpacing: ".12em", color: C.muted, textTransform: "uppercase" }}>Efectivo</span>
                    <span className="cmd-num" style={{ fontFamily: F.slab, fontSize: 34, color: tendered === null ? C.muted : C.ink }}>{tendered === null ? "—" : posMoney(tendered)}</span>
                  </div>
                  <div style={{ marginTop: 10, borderRadius: 6, padding: "12px 16px", background: tendered === null ? "transparent" : short ? C.red : C.green, color: tendered === null ? C.muted : C.paperLt, display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, border: tendered === null ? `1px dashed ${C.rule}` : "none" }}>
                    <span style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase" }}>{short ? "Faltan" : "Cambio"}</span>
                    <span className="cmd-num" style={{ fontFamily: F.slab, fontSize: 34 }}>{tendered === null ? "—" : posMoney(Math.abs(change))}</span>
                  </div>
                </div>
                <Keypad onKey={key} />
              </div>
            ) : (
              <div style={{ marginTop: 22, padding: "22px 20px", border: `1px dashed ${C.rule}`, borderRadius: 6, color: C.ink2, fontSize: 13, lineHeight: 1.6 }}>
                {s.payMethod === "tarjeta"
                  ? <>Pasa <b>{posMoney(total)}</b> por el datáfono y confirma cuando apruebe.</>
                  : <>Verifica la transferencia por <b>{posMoney(total)}</b> (Nequi, Daviplata o QR) y confirma.</>}
              </div>
            )}

            {s.sendError && <div role="alert" style={{ marginTop: 12, fontSize: 12, color: C.red, border: `1px solid ${C.red}`, padding: "8px 10px", borderRadius: 4 }}>{s.sendError}</div>}

            <button
              className="cmd-btn red"
              onClick={() => void completeSale()}
              disabled={!canConfirm}
              style={{ marginTop: 16, height: 64, fontSize: 16, fontWeight: 600, letterSpacing: ".06em", opacity: canConfirm ? 1 : 0.4, cursor: canConfirm ? "pointer" : "not-allowed", flexShrink: 0 }}
            >
              {s.sending ? "Registrando…" : isCash && tendered !== null && !short ? `Confirmar · cambio ${posMoney(change)}` : `Confirmar cobro · ${posMoney(total)}`}
            </button>
          </div>
        </div>
      </div>
    </Overlay>
  );
}

function Keypad({ onKey }: { onKey: (k: string) => void }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"];
  return (
    <div style={{ width: 240, flexShrink: 0, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, alignContent: "start" }}>
      {keys.map((k) => (
        <button key={k} className="pos-key" onClick={() => onKey(k)} aria-label={k === "⌫" ? "Borrar" : k === "C" ? "Limpiar" : k} style={{
          height: 60, borderRadius: 6, cursor: "pointer", fontFamily: F.mono, fontSize: k === "⌫" ? 20 : 22, fontWeight: 600,
          border: `1.5px solid ${C.rule}`, background: C.paperLt, color: k === "C" ? C.red : C.ink,
        }}>{k}</button>
      ))}
      <button className="pos-key" onClick={() => onKey("000")} style={{ gridColumn: "span 3", height: 48, borderRadius: 6, cursor: "pointer", fontFamily: F.mono, fontSize: 16, fontWeight: 600, border: `1.5px solid ${C.rule}`, background: C.paperLt, color: C.ink }}>000</button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Receipt
// ════════════════════════════════════════════════════════════════
function ReceiptScreen() {
  const s = usePos();
  const pendiente = s.receiptKind === "pendiente";
  const method = PAY_METHODS.find((m) => m.id === s.payMethod)?.label ?? s.payMethod;
  const btnRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => { btnRef.current?.focus(); }, []);
  return (
    <Overlay align="fill">
      <div className="pos-card" style={{ width: "min(560px, 92vw)", textAlign: "center", padding: "40px 32px 32px", border: `1.5px solid ${C.ink}`, borderRadius: 10, background: C.paperLt }}>
        <div style={{ width: 64, height: 64, borderRadius: 32, margin: "0 auto", background: pendiente ? C.amber : C.green, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>{pendiente ? "⏱" : "✓"}</div>
        <div style={{ fontFamily: F.slab, fontSize: 30, marginTop: 16 }}>{pendiente ? "Pedido enviado" : "Venta registrada"}</div>
        <div style={{ fontSize: 11, letterSpacing: ".14em", color: C.muted, textTransform: "uppercase", marginTop: 6 }}>
          {pendiente ? "Pendiente de pago · " : ""}Pedido <span className="cmd-num" style={{ color: C.ink }}>{s.orderNo}</span>{pendiente ? "" : ` · ${method}`}{s.customerName ? ` · ${s.customerName}` : ""}
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 28, marginTop: 26 }}>
          <div>
            <div style={{ fontSize: 10.5, letterSpacing: ".12em", color: C.muted, textTransform: "uppercase" }}>Total</div>
            <div className="cmd-num" style={{ fontFamily: F.slab, fontSize: 34, marginTop: 2 }}>{posMoney(s.lastTotal)}</div>
          </div>
          {!pendiente && s.payMethod === "efectivo" && (
            <div>
              <div style={{ fontSize: 10.5, letterSpacing: ".12em", color: C.muted, textTransform: "uppercase" }}>Cambio</div>
              <div className="cmd-num" style={{ fontFamily: F.slab, fontSize: 34, marginTop: 2, color: C.green }}>{posMoney(s.lastChange)}</div>
            </div>
          )}
        </div>
        <button ref={btnRef} className="cmd-btn" onClick={resetConversation} style={{ marginTop: 30, width: "100%", height: 60, fontSize: 15 }}>
          Nuevo pedido
        </button>
        <ReceiptPrinterLine />
        <div style={{ fontSize: 10.5, color: C.muted, marginTop: 12 }}>Enter · nuevo pedido</div>
      </div>
    </Overlay>
  );
}

/**
 * Under "Nuevo pedido": what happened with the label, plus a reprint button.
 * The label is queued the moment the sale is saved, so by the time the
 * receipt shows it's usually already printing.
 */
function ReceiptPrinterLine() {
  const p = usePrinter();
  const s = usePos();
  const catalog = useCatalog();
  if (p.status === "unsupported") return null;
  const printed = p.lastPrinted?.folio === s.orderNo;
  const igPrinted = p.lastPrinted?.folio === INSTAGRAM_FOLIO;
  const frasePrinted = p.lastPrinted?.folio === FRASE_FOLIO;
  const stickerPrinted = p.lastPrinted?.folio === STICKER_FOLIO;
  const busy = p.status === "printing" || p.status === "connecting";
  const text = busy
    ? "Imprimiendo etiqueta…"
    : p.note && (p.status === "error" || p.status === "disconnected" || p.status === "off")
      ? p.note
      : igPrinted
        ? "Etiqueta de Instagram impresa"
        : frasePrinted
          ? "Frase impresa"
          : stickerPrinted
            ? "Sticker impreso"
          : printed
            ? "Etiqueta impresa"
            : null;
  return (
    <>
    {(s.frase || s.fraseError) && (
      <div style={{ marginTop: 14, padding: "10px 14px", border: `1px dashed ${s.fraseError ? C.red : C.rule}`, borderRadius: 6, fontSize: 13, color: s.fraseError ? C.red : C.ink, lineHeight: 1.45 }}>
        {s.fraseError ?? s.frase}
      </div>
    )}
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 14, minHeight: 20, flexWrap: "wrap" }}>
      {text && (
        <span style={{ fontSize: 11, letterSpacing: ".08em", color: p.status === "error" ? C.red : C.muted, textTransform: "uppercase" }}>
          {text}
        </span>
      )}
      <button
        onClick={() => (p.status === "ready" ? reprintLabel() : p.status === "off" ? void checkPrinter() : void connectPrinter())}
        disabled={busy}
        style={{ height: 32, padding: "0 12px", borderRadius: 3, cursor: busy ? "default" : "pointer", border: `1.5px solid ${C.rule}`, background: "transparent", color: C.ink, fontFamily: F.mono, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase" }}
      >
        {p.status === "ready" ? "Reimprimir etiqueta" : p.status === "off" ? "Reintentar" : "Conectar impresora"}
      </button>
      {catalog.instagram && p.status === "ready" && (
        <button
          onClick={() => printInstagramLabel(catalog.instagram!)}
          disabled={busy}
          title={`Imprime un QR a instagram.com/${catalog.instagram}`}
          style={{ height: 32, padding: "0 12px", borderRadius: 3, cursor: busy ? "default" : "pointer", border: `1.5px solid ${C.rule}`, background: "transparent", color: C.ink, fontFamily: F.mono, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase" }}
        >
          QR Instagram
        </button>
      )}
      {catalog.sticker && p.status === "ready" && (
        <button
          onClick={() => printStickerLabel(catalog.sticker!)}
          disabled={busy}
          title="Imprime el sticker de la marca"
          style={{ height: 32, padding: "0 12px", borderRadius: 3, cursor: busy ? "default" : "pointer", border: `1.5px solid ${C.rule}`, background: "transparent", color: C.ink, fontFamily: F.mono, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase" }}
        >
          Sticker PA&apos;YO
        </button>
      )}
      {p.status === "ready" && (
        <button
          onClick={() => void printFrase()}
          disabled={busy || s.fraseLoading}
          title="La IA escribe una frase corta (graciosa, motivadora o de la noticia del día) y la imprime para el vaso"
          style={{ height: 32, padding: "0 12px", borderRadius: 3, cursor: busy || s.fraseLoading ? "default" : "pointer", border: `1.5px solid ${C.rule}`, background: "transparent", color: C.ink, fontFamily: F.mono, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase" }}
        >
          {s.fraseLoading ? "Pensando…" : "Frase IA"}
        </button>
      )}
    </div>
    </>
  );
}

// ════════════════════════════════════════════════════════════════
// AI drawer (mic · suggestions · transcript)
// ════════════════════════════════════════════════════════════════
function AiDrawer() {
  const s = usePos();
  const open = s.suggestions;
  const idle = s.transcript.length === 0;
  return (
    <div className="pos-drawer" style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: DRAWER_W, maxWidth: "100%", zIndex: 30, display: "flex", flexDirection: "column", background: C.ink, boxShadow: "-18px 0 40px -24px rgba(0,0,0,.6)" }}>
      <AiHeader />
      <div className="pos-scroll" style={{ flex: 1, overflowY: "auto", padding: "14px 14px 8px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 10, letterSpacing: ".18em", color: "rgba(244,236,220,.5)", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 8 }}>
          <span>Sugerencias</span>
          {s.thinking && <span style={{ color: C.amber, letterSpacing: ".08em" }}>· pensando…</span>}
          <span style={{ flex: 1, borderTop: "1px dashed rgba(244,236,220,.2)" }} />
        </div>
        {s.micNote && <div style={{ fontSize: 11, color: C.amber, border: `1px solid ${C.amber}`, borderRadius: 3, padding: "9px 11px", lineHeight: 1.5 }}>{s.micNote}</div>}
        {open.length === 0 && (
          <div style={{ color: "rgba(244,236,220,.55)", fontSize: 12, lineHeight: 1.7, padding: "14px 4px" }}>
            {idle
              ? "Activa el micrófono (o escribe abajo) y el asistente escuchará la conversación para darte ideas: agregar productos, combos, personalizar y atender alergias."
              : "Todo en orden. Sigo escuchando y te aviso si surge una oportunidad."}
          </div>
        )}
        {open.map((g) => <SuggestionCard key={g.uid} g={g} />)}
      </div>
      <TranscriptDock />
      <AiControls />
    </div>
  );
}

function AiHeader() {
  const s = usePos();
  const live = s.listening;
  return (
    <div style={{ padding: "12px 14px 12px", borderBottom: "1px solid rgba(244,236,220,.16)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
          <span style={{ width: 30, height: 30, borderRadius: 30, border: `1.5px solid ${C.red}`, color: C.red, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>IA</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.paperLt, letterSpacing: ".02em" }}>Asistente</div>
            <div style={{ fontSize: 9.5, color: "rgba(244,236,220,.55)", letterSpacing: ".04em" }}>Escucha la conversación y sugiere</div>
          </div>
        </div>
        <button onClick={() => posStore.set((st) => ({ ...st, listening: !st.listening }))} title="Activar/pausar micrófono" style={{
          display: "flex", alignItems: "center", gap: 7, background: "transparent", border: `1px solid ${live ? C.red : "rgba(244,236,220,.3)"}`,
          color: live ? C.red : "rgba(244,236,220,.7)", fontFamily: F.mono, fontSize: 10, letterSpacing: ".1em", height: 36, padding: "0 10px", cursor: "pointer", borderRadius: 3, flexShrink: 0,
        }}>
          <span className={"pos-eq" + (live ? "" : " paused")} style={{ display: "inline-flex", alignItems: "flex-end", gap: 2, height: 14 }}><i /><i /><i /><i /><i /></span>
          {live ? "ESCUCHANDO" : "MICRÓFONO"}
        </button>
        <button onClick={() => posStore.set({ aiOpen: false })} aria-label="Cerrar asistente" style={{ width: 36, height: 36, borderRadius: 3, border: "1px solid rgba(244,236,220,.3)", background: "transparent", color: C.paperLt, fontSize: 18, cursor: "pointer", flexShrink: 0 }}>×</button>
      </div>
      <div style={{ marginTop: 9, display: "flex", alignItems: "center", gap: 7, fontSize: 9.5, color: "rgba(244,236,220,.62)", lineHeight: 1.4 }}>
        <span className={live ? "pos-rec" : ""} style={{ width: 7, height: 7, borderRadius: 7, background: live ? C.red : "rgba(244,236,220,.4)", flexShrink: 0 }} />
        <span>Cliente informado · el audio se transcribe en la nube; no se almacena.</span>
      </div>
    </div>
  );
}

const KIND_COLOR: Record<PosSuggestKind, { line: string; tag: string }> = {
  pedido: { line: C.paperLt, tag: C.ink2 },
  combo: { line: C.green, tag: C.green },
  upsell: { line: C.amber, tag: C.amber },
  modificador: { line: C.amber, tag: C.amber },
  agotado: { line: C.red, tag: C.red },
  alergia: { line: C.red, tag: C.red },
  atencion: { line: C.amber, tag: C.amber },
  fidelidad: { line: C.green, tag: C.green },
};

function SuggestionCard({ g }: { g: SuggestionCardState }) {
  const col = KIND_COLOR[g.kind] || KIND_COLOR.pedido;
  return (
    <div className="pos-card" style={{ background: C.paperLt, borderRadius: 4, borderLeft: `4px solid ${col.line}`, boxShadow: "0 6px 18px -10px rgba(0,0,0,.5)", overflow: "hidden" }}>
      <div style={{ padding: "11px 13px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: col.tag, border: `1px solid ${col.tag}`, padding: "2px 6px", borderRadius: 2 }}>
            {POS_KIND_LABEL[g.kind] || "Idea"}
          </span>
          <button onClick={() => dismissSuggestion(g.uid, false)} title="Descartar" style={{ background: "transparent", border: "none", color: C.muted, fontSize: 16, cursor: "pointer", lineHeight: 1, padding: 2 }}>×</button>
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, lineHeight: 1.3 }}>{g.title}</div>
        {g.detail && <div style={{ fontSize: 11.5, color: C.ink2, lineHeight: 1.5, marginTop: 5 }}>{g.detail}</div>}
        {g.say && (
          <div style={{ marginTop: 10, background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 4, padding: "9px 11px" }}>
            <div style={{ fontSize: 8.5, letterSpacing: ".16em", color: C.muted, textTransform: "uppercase", marginBottom: 4 }}>Para decir en voz alta</div>
            <div style={{ fontFamily: F.script, fontSize: 18, color: C.ink, lineHeight: 1.25 }}>“{g.say}”</div>
          </div>
        )}
        {g.actionLabel && g.act && (
          <button onClick={() => { applyAct(g.act); dismissSuggestion(g.uid, true); }} style={{
            marginTop: 11, width: "100%", fontFamily: F.mono, fontSize: 12, fontWeight: 600, letterSpacing: ".02em", minHeight: 42,
            background: col.line === C.paperLt ? C.ink : col.line, color: C.paperLt, border: "none", borderRadius: 3, padding: "10px", cursor: "pointer",
          }}>{g.actionLabel}</button>
        )}
      </div>
    </div>
  );
}

function TranscriptDock() {
  const s = usePos();
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [s.transcript.length, s.interim]);
  return (
    <div style={{ height: 168, borderTop: "1px solid rgba(244,236,220,.16)", background: "rgba(0,0,0,.18)", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "9px 14px 4px", display: "flex", alignItems: "center", gap: 8, fontSize: 9.5, letterSpacing: ".16em", color: "rgba(244,236,220,.5)", textTransform: "uppercase" }}>
        <span>Conversación</span><span style={{ flex: 1, borderTop: "1px dashed rgba(244,236,220,.18)" }} />
        <span className="cmd-num">{s.transcript.length}</span>
      </div>
      <div ref={ref} className="pos-scroll" style={{ flex: 1, overflowY: "auto", padding: "4px 14px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
        {s.transcript.length === 0 && !s.interim && (
          <div style={{ fontSize: 11, color: "rgba(244,236,220,.4)", paddingTop: 8 }}>
            {s.listening ? "Escuchando… habla y aparecerá aquí." : "Esperando la conversación…"}
          </div>
        )}
        {s.transcript.map((t, i) =>
          t.who === "sistema" ? (
            <div key={i} style={{ textAlign: "center", fontSize: 9.5, color: "rgba(244,236,220,.4)", letterSpacing: ".06em", fontStyle: "italic" }}>· {t.text} ·</div>
          ) : (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
              <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: ".08em", color: t.who === "cliente" ? C.amber : C.green, minWidth: 50, textTransform: "uppercase" }}>{t.who}</span>
              <span style={{ fontSize: 11.5, color: C.paperLt, lineHeight: 1.4, flex: 1 }}>{t.text}</span>
              <span className="cmd-num" style={{ fontSize: 8.5, color: "rgba(244,236,220,.35)" }}>{t.time}</span>
            </div>
          ),
        )}
        {s.interim && (
          <div style={{ display: "flex", gap: 8, alignItems: "baseline", opacity: 0.7 }}>
            <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: ".08em", color: C.amber, minWidth: 50, textTransform: "uppercase" }}>···</span>
            <span style={{ fontSize: 11.5, color: C.paperLt, lineHeight: 1.4, flex: 1, fontStyle: "italic" }}>{s.interim}</span>
          </div>
        )}
      </div>
    </div>
  );
}

const ctrlBtn: React.CSSProperties = { flex: "0 0 auto", fontFamily: F.mono, fontSize: 12, background: "transparent", border: "1px solid rgba(244,236,220,.32)", color: C.paperLt, height: 40, minWidth: 40, padding: "0 12px", cursor: "pointer", borderRadius: 3 };

function AiControls() {
  const [text, setText] = React.useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    appendTranscript("cliente", t);
    setText("");
  };
  return (
    <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderTop: "1px solid rgba(244,236,220,.16)" }}>
      <form onSubmit={submit} style={{ flex: 1, display: "flex", gap: 8 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escribe lo que dijo el cliente…"
          style={{ flex: 1, fontFamily: F.mono, fontSize: 12, background: "rgba(244,236,220,.06)", border: "1px solid rgba(244,236,220,.28)", color: C.paperLt, height: 40, padding: "0 11px", borderRadius: 3, outline: "none", minWidth: 0 }}
        />
        <button type="submit" style={ctrlBtn} title="Enviar al asistente">▶</button>
      </form>
      <button onClick={resetConversation} style={ctrlBtn} title="Reiniciar pedido y conversación">↺</button>
    </div>
  );
}
