"use client";

/**
 * Punto de venta — Square-style register for a coffee shop.
 *
 * One full-screen view, tablet-first. Two layouts, picked by CSS alone (see
 * POS_CSS) so the first paint is already the right one:
 *
 *   · wide (≥ 900 px — the register PC, a tablet in landscape): catalog and
 *     ticket side by side, as drawn below.
 *   · narrow (< 900 px — a tablet in portrait, carried around the tables):
 *     the catalog takes the whole width and the ticket slides over it from a
 *     bar at the bottom that always shows the count and the total.
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
import { FAV_CAT, type PosCatalog } from "@/lib/pos/types";
import { usePosLive } from "./pos-live";
import { usePosWindowLease } from "./pos-window";
import { CatalogCtx, StationCtx, usePos, posStore, useMicTranscribe, scheduleSuggest, hydrateOutbox, watchConnectivity, hydratePendientes, cancelTender, closeOrdenes, closeEtiquetas, closePuntos, hydrateBarista, setBarista, refreshOrdenes, refreshPendientes, type PosSessionPerson } from "./pos-store";
import { usePrinterAutoConnect, setLabelDefaults } from "@/lib/printer/serial";
import { useDesktopAppEvents } from "@/lib/pwa/desktop";
import { C, F, POS_CSS } from "./_components/theme";
import { BaristaPicker, TopBar } from "./_components/top-bar";
import { Catalog } from "./_components/catalog";
import { Ticket } from "./_components/ticket";
import { OrdenesScreen } from "./_components/ordenes";
import { ItemSheet, RecetaSheet } from "./_components/sheets";
import { PuntosScreen } from "./_components/puntos";
import { EtiquetasScreen } from "./_components/etiquetas";
import { TenderScreen } from "./_components/tender";
import { ReceiptScreen } from "./_components/receipt";
import { AiDrawer } from "./_components/ai";

// ════════════════════════════════════════════════════════════════
// Root
// ════════════════════════════════════════════════════════════════
export function PosTerminal({
  catalog,
  station = "Caja 01",
  mode = "user",
  organizationId,
  person = null,
}: {
  catalog: PosCatalog;
  /** Scopes the live channel the stations of one business share. */
  organizationId: string;
  /** Header label for this register ("Caja 2"). */
  station?: string;
  /** `device` = paired tablet (no account); `user` = signed-in org member. */
  mode?: "device" | "user";
  /** Person signed in on this register (single login); seeded into the store for `creadoPor`. */
  person?: PosSessionPerson | null;
}) {
  // The person in session rides on every order (`creadoPor`) and shows in the top bar.
  const personId = person?.id ?? null;
  const personName = person?.name ?? "";
  const personRole = person?.role ?? "staff";
  React.useEffect(() => {
    posStore.set({ person: personId ? { id: personId, name: personName, role: personRole } : null });
  }, [personId, personName, personRole]);
  // Seed the store's catalog once so imperative actions can read it. When
  // Favoritos would be empty (no stars and nothing sold yet), start on the
  // first real category instead.
  React.useEffect(() => {
    const hasFavs = catalog.top.length > 0 || catalog.menu.some((p) => p.fav);
    const firstReal = catalog.cats.find((c) => c.id !== FAV_CAT)?.id;
    const cur = posStore.get().cat;
    posStore.set({
      catalog,
      ...(!hasFavs && firstReal && (cur === FAV_CAT || !cur) ? { cat: firstReal } : {}),
    });
    hydrateBarista();
    seedBaristaFromPerson(personId);
    // «Ver en POS» from a product page: /pos?buscar=<sku>.
    const q = new URLSearchParams(window.location.search).get("buscar");
    if (q) posStore.set({ search: q.slice(0, 60) });
    // personId: a new person on this register gets their own default barista.
  }, [catalog, personId]);
  // What every printed label shows in its kicker line.
  React.useEffect(() => {
    setLabelDefaults({ station, orgName: catalog.orgName, art: catalog.handArt });
  }, [station, catalog.orgName, catalog.handArt]);

  return (
    <CatalogCtx.Provider value={catalog}>
      <StationCtx.Provider value={station}>
        <Register mode={mode} organizationId={organizationId} />
      </StationCtx.Provider>
    </CatalogCtx.Provider>
  );
}

const BARISTA_SEED_KEY = "pos:barista-seed";
/**
 * «Preparo yo» by default: when the person who signs in is on the team, the
 * bar is credited to them — once per person (a manual pick in «¿Quién
 * prepara?» sticks until somebody else signs in on this register).
 */
function seedBaristaFromPerson(personId: string | null) {
  if (!personId) return;
  const st = posStore.get();
  const me = st.catalog.equipo.find((m) => m.id === personId);
  if (!me) return;
  try {
    if (window.localStorage.getItem(BARISTA_SEED_KEY) === personId) return;
    window.localStorage.setItem(BARISTA_SEED_KEY, personId);
  } catch { /* private mode: seed every load */ }
  setBarista(me);
}

/** Another station wrote an order: reload what this one shows. */
function reloadOrders() {
  void refreshPendientes();
  if (posStore.get().view === "ordenes") void refreshOrdenes();
}

function Register({ mode, organizationId }: { mode: "device" | "user"; organizationId: string }) {
  const s = usePos();
  useMicTranscribe(s.listening);
  // One POS window per PC: a second one stands aside and lets go of the printer.
  const ventana = usePosWindowLease();
  // Reopen the label printer if this browser was already paired with it, and
  // follow the USB cable (connect / disconnect events).
  usePrinterAutoConnect(ventana.role !== "secondary");
  // Labels relayed to / claimed from the other stations, and their order nudges.
  usePosLive(organizationId, reloadOrders);
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
    hydratePendientes();
    watchConnectivity();
    hydrateOutbox();
    void refreshPendientes();
    registerOfflineWorker();
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
      else if (st.view === "etiquetas") closeEtiquetas();
      else if (st.view === "puntos") closePuntos();
      else if (st.aiOpen) posStore.set({ aiOpen: false });
      else if (st.ticketOpen) posStore.set({ ticketOpen: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="pos-root cmd-paper" onContextMenu={(e) => { e.preventDefault(); }} style={{ height: "100dvh", display: "flex", flexDirection: "column", background: C.paper, fontFamily: F.mono, color: C.ink, overflow: "hidden" }}>
      <style>{POS_CSS}</style>
      <TopBar mode={mode} />
      <div style={{ flex: 1, display: "flex", minHeight: 0, position: "relative" }}>
        <Catalog />
        {/* Narrow layout only: dims the catalog behind the open ticket; a tap closes it. */}
        <div aria-hidden className={"pos-scrim" + (s.ticketOpen ? " open" : "")} onClick={() => posStore.set({ ticketOpen: false })} />
        <Ticket />
        {s.aiOpen && <AiDrawer />}
      </div>
      {s.sheet && (s.sheet.mode === "receta"
        ? <RecetaSheet key={`receta:${s.sheet.productId}`} productId={s.sheet.productId} />
        : <ItemSheet key={s.sheet.mode === "add" ? `add:${s.sheet.productId}` : `edit:${s.sheet.idx}`} />)}
      {s.view === "ordenes" && <OrdenesScreen />}
      {s.view === "etiquetas" && <EtiquetasScreen />}
      {s.view === "puntos" && <PuntosScreen />}
      {s.baristaPicker && <BaristaPicker />}
      {ventana.role === "secondary" && <OtraVentana onTakeOver={ventana.takeOver} />}
      {s.view === "tender" && <TenderScreen />}
      {s.view === "done" && <ReceiptScreen />}
    </div>
  );
}

/**
 * Shown over everything when another POS window is already open in this
 * browser. Nothing here can be tapped by accident; the person either goes
 * to the other window or makes this one the register.
 */
function OtraVentana({ onTakeOver }: { onTakeOver: () => void }) {
  return (
    <div role="alertdialog" aria-modal aria-label="Otra ventana del POS" style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(20,14,8,.78)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "min(520px, 94vw)", background: C.paperLt, border: `2px solid ${C.red}`, borderRadius: 10, padding: "24px 26px", fontFamily: F.mono, color: C.ink }}>
        <div style={{ fontFamily: F.slab, fontSize: 26, lineHeight: 1.1 }}>Ya hay otra ventana del POS abierta<span style={{ color: C.red }}>.</span></div>
        <p style={{ fontSize: 13.5, lineHeight: 1.55, margin: "12px 0 18px", color: C.ink2 }}>
          En este PC solo una ventana puede cobrar y manejar la etiquetadora. Usa la otra ventana, o cierra esta. Si la otra ya no sirve, puedes seguir en esta: la otra quedará bloqueada.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" className="cmd-btn ghost" onClick={() => window.close()} style={{ height: 46 }}>Cerrar esta ventana</button>
          <button type="button" className="cmd-btn red" onClick={() => { if (window.confirm("La otra ventana quedará bloqueada y la etiquetadora pasará a esta. ¿Seguir aquí?")) onTakeOver(); }} style={{ height: 46 }}>Seguir en esta ventana</button>
        </div>
      </div>
    </div>
  );
}

/**
 * The register keeps selling without internet: a service worker keeps the
 * page and its assets (public/pos-sw.js), the outbox keeps the orders. Only
 * in production — in dev a cached page would hide every edit.
 */
function registerOfflineWorker() {
  if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker
    .register("/pos-sw.js", { scope: "/pos" })
    .then(async () => {
      // Hand the worker everything this page already loaded (it may have come
      // before the worker existed), so the next offline reload finds it all.
      const reg = await navigator.serviceWorker.ready;
      const cat = posStore.get().catalog;
      const urls = [
        location.href,
        ...performance.getEntriesByType("resource").map((e) => e.name),
        // Label art loads only when a label prints; product photos when a recipe opens.
        ...[cat.sticker, cat.cupArt, cat.handArt, ...cat.menu.map((p) => p.image)].filter((u): u is string => !!u).map((u) => new URL(u, location.href).href),
      ].filter((u) => u.startsWith(location.origin) || u.includes("/storage/v1/object/"));
      reg.active?.postMessage({ type: "cache", urls });
    })
    .catch((e) => console.warn("[pos] service worker:", e));
}
