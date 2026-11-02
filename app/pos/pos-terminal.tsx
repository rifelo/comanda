"use client";

/**
 * Comanda POS — the register, from the design canvas «Tablet PA'YO ·
 * Rediseño», page «Comanda POS» (tokens and classes in ./pos.css).
 *
 * One client app; every screen has its own URL (pos-routes.ts):
 *
 *   /pos                        Venta: Favoritos, categories, search, combos,
 *                               pending-orders strip, ticket (name, «¿Quién
 *                               prepara?», Efectivo · Transferencia · …)
 *   /pos/item/<id>              Opciones del producto + «Recomiéndale»
 *   /pos/pay/efectivo           cash keypad (3 taps from Favoritos)
 *   /pos/pay/transferencia      transfer checklist
 *   /pos/pay/datafono           Bold voucher (record only)
 *   /pos/done                   Venta registrada (closes itself when no change)
 *   /pos/pedidos                Pendientes · Completados (+ Cancelar, Combinar)
 *   /pos/pedidos/<id>/personas  split by person
 *   /pos/ventas                 Hoy en ventas (KPIs, por hora, más vendidos, pagos, barista)
 *
 * Overlays over any screen: Receta (hold a tile), barista picker, assistant,
 * Etiquetas, Puntos, the offline bar and the printer toast. Below 1024 px the
 * ticket collapses into a cart bar that keeps Efectivo + Transferencia.
 *
 * All state/logic lives in pos-store.ts; this file only picks the screen.
 */

import * as React from "react";
import { FAV_CAT, type PosCatalog } from "@/lib/pos/types";
import { usePosLive } from "./pos-live";
import { usePosWindowLease } from "./pos-window";
import { CatalogCtx, StationCtx, usePos, posStore, useMicTranscribe, scheduleSuggest, hydrateOutbox, watchConnectivity, hydratePendientes, cancelTender, closeOrdenes, closeEtiquetas, closePuntos, hydrateBarista, setBarista, refreshOrdenes, refreshPendientes, closeVentas, type PosSessionPerson } from "./pos-store";
import { usePrinterAutoConnect, setLabelDefaults } from "@/lib/printer/serial";
import { CUP_LABEL_ASSETS } from "@/lib/printer/label";
import { recetasDelMenu } from "@/lib/printer/ticket";
import { TIRILLA_ASSETS } from "@/lib/printer/tirillas";
import { setTicketLogo, setTicketRecetas } from "@/lib/printer/tickets";
import { useDesktopAppEvents } from "@/lib/pwa/desktop";
import { POS_CSS } from "./_components/theme";
import { BaristaPicker, TopBar } from "./_components/top-bar";
import { Catalog, CartBar } from "./_components/catalog";
import { Ticket } from "./_components/ticket";
import { OfflineBar, PrinterToast } from "./_components/estados";
import { RecetaSheet } from "./_components/sheets";
import { OpcionesPage } from "./_components/opciones";
import { EfectivoPage } from "./_components/pay-efectivo";
import { TransferenciaPage } from "./_components/pay-transferencia";
import { DatafonoPage } from "./_components/pay-datafono";
import { VentaRegistradaPage } from "./_components/done";
import { PedidosPage } from "./_components/ordenes";
import { PersonasPage } from "./_components/personas";
import { VentasPage } from "./_components/ventas";
import { PuntosScreen } from "./_components/puntos";
import { EtiquetasScreen } from "./_components/etiquetas";
import { AiDrawer } from "./_components/ai";
import { usePosRouting } from "./pos-routes";
import { useAppClass } from "./pos-theme";
import "./pos.css";

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
  // The receipt's logo, cached on this device for offline printing.
  React.useEffect(() => { setTicketLogo(catalog.recibo.logo); }, [catalog.recibo.logo]);
  // The comanda's recipes come from this catalog, by SKU.
  React.useEffect(() => { setTicketRecetas(recetasDelMenu(catalog.menu, catalog.modGroups)); }, [catalog.menu, catalog.modGroups]);

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
  // tab is visible (every 15 s) — another register may send or settle orders too.
  React.useEffect(() => {
    hydratePendientes();
    watchConnectivity();
    hydrateOutbox();
    void refreshPendientes();
    registerOfflineWorker();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshPendientes();
    }, 15_000);
    return () => window.clearInterval(id);
  }, []);

  // Each screen has a URL; the first run reads the one the register opened on.
  usePosRouting(true);

  // Escape closes whatever is on top.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const st = posStore.get();
      if (st.sheet) posStore.set({ sheet: null });
      else if (st.view === "tender") cancelTender();
      else if (st.view === "ordenes") closeOrdenes();
      else if (st.view === "personas") closeOrdenes();
      else if (st.view === "etiquetas") closeEtiquetas();
      else if (st.view === "puntos") closePuntos();
      else if (st.view === "ventas") closeVentas();
      else if (st.aiOpen) posStore.set({ aiOpen: false });
      else if (st.ticketOpen) posStore.set({ ticketOpen: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const appClass = useAppClass();
  const itemPage = s.view === "sale" && (s.sheet?.mode === "add" || s.sheet?.mode === "edit");
  // The options modal sits over the sale view (Opciones.dc.html), which stays rendered but inert.
  const saleShown = s.view === "sale" || s.view === "etiquetas" || s.view === "puntos";

  return (
    <div className={appClass} onContextMenu={(e) => { e.preventDefault(); }}>
      {/* Etiquetas / Puntos / the assistant still use the older inline styles (theme.tsx). */}
      <style>{POS_CSS}</style>
      <OfflineBar />
      {saleShown && (
        <div inert={s.view !== "sale" || itemPage} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <TopBar mode={mode} />
          <div className="sale">
            <Catalog />
            <Ticket />
          </div>
          <CartBar />
          {s.aiOpen && <AiDrawer />}
        </div>
      )}
      {itemPage && <OpcionesPage key={s.sheet?.mode === "add" ? `add:${s.sheet.productId}` : `edit:${s.sheet?.mode === "edit" ? s.sheet.idx : ""}`} />}
      {s.view === "tender" && (s.payMethod === "efectivo" ? <EfectivoPage /> : s.payMethod === "transferencia" ? <TransferenciaPage /> : <DatafonoPage />)}
      {s.view === "done" && <VentaRegistradaPage />}
      {s.view === "ordenes" && <PedidosPage />}
      {s.view === "personas" && <PersonasPage />}
      {s.view === "ventas" && <VentasPage />}
      {s.view === "etiquetas" && <EtiquetasScreen />}
      {s.view === "puntos" && <PuntosScreen />}
      {s.sheet?.mode === "receta" && <RecetaSheet key={`receta:${s.sheet.productId}`} productId={s.sheet.productId} />}
      {s.baristaPicker && <BaristaPicker />}
      <PrinterToast />
      {ventana.role === "secondary" && <OtraVentana onTakeOver={ventana.takeOver} />}
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
    <div className="scrim" style={{ position: "fixed", zIndex: 60 }}>
      <section className="sheet" role="alertdialog" aria-modal="true" aria-labelledby="otra-ventana" style={{ maxWidth: 560, border: "2px solid var(--late)" }}>
        <h2 id="otra-ventana" className="h1">Ya hay otra ventana del POS abierta</h2>
        <p className="muted" style={{ fontSize: 16, lineHeight: 1.5 }}>
          En este PC solo una ventana puede cobrar y manejar la etiquetadora. Usa la otra ventana, o cierra esta. Si la otra ya no sirve, puedes seguir en esta: la otra quedará bloqueada.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button type="button" className="btn ghost" style={{ flex: 1 }} onClick={() => window.close()}>Cerrar esta ventana</button>
          <button type="button" className="btn danger" style={{ flex: 1 }} onClick={() => { if (window.confirm("La otra ventana quedará bloqueada y la etiquetadora pasará a esta. ¿Seguir aquí?")) onTakeOver(); }}>Seguir en esta ventana</button>
        </div>
      </section>
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
        ...[cat.sticker, cat.cupArt, cat.handArt, ...CUP_LABEL_ASSETS, ...TIRILLA_ASSETS, ...cat.menu.map((p) => p.image)].filter((u): u is string => !!u).map((u) => new URL(u, location.href).href),
      ].filter((u) => u.startsWith(location.origin) || u.includes("/storage/v1/object/"));
      reg.active?.postMessage({ type: "cache", urls });
    })
    .catch((e) => console.warn("[pos] service worker:", e));
}
