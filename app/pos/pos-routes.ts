"use client";

/**
 * Every POS screen has its own URL, but the register stays one client app:
 * screens change with history.pushState (Next keeps usePathname in sync and
 * fetches nothing), so a sale never waits on the network to move from the
 * ticket to the cash page — offline included. A reload or a typed URL lands
 * on the catch-all route (app/pos/[[...path]]), which renders the same app;
 * `applyPath` then puts the store on that screen when it makes sense (a pay
 * page with an empty ticket goes back to /pos).
 *
 *   /pos                          sale (catalog + ticket)
 *   /pos/item/<id>[?linea=<n>]    product options (add, or edit ticket line n)
 *   /pos/pay/<metodo>             efectivo · transferencia · datafono
 *   /pos/done                     sale registered
 *   /pos/pedidos                  orders
 *   /pos/pedidos/<id>/personas    split an order by person
 *   /pos/ventas                   «Hoy en ventas» (team-facing numbers)
 *
 * Overlays (receta, cancelar, combinar, etiquetas, puntos, asistente) have
 * no URL of their own.
 */
import * as React from "react";
import { posStore, usePos, openOrdenes, openVentas, chargePendingSplit, type PosState, type PayMethod } from "./pos-store";

const PAY: readonly PayMethod[] = ["efectivo", "transferencia", "datafono"];

/** The URL of the screen the store is on. */
export function pathFor(s: Pick<PosState, "view" | "payMethod" | "pending" | "sheet" | "order">): string {
  switch (s.view) {
    case "tender":
      return `/pos/pay/${s.payMethod}`;
    case "done":
      return "/pos/done";
    case "ordenes":
      return "/pos/pedidos";
    case "ventas":
      return "/pos/ventas";
    case "personas":
      return s.pending ? `/pos/pedidos/${s.pending.id}/personas` : "/pos/pedidos";
    default:
      if (s.sheet?.mode === "add") return `/pos/item/${s.sheet.productId}`;
      if (s.sheet?.mode === "edit") {
        const line = s.order[s.sheet.idx];
        return line ? `/pos/item/${line.id}?linea=${s.sheet.idx}` : "/pos";
      }
      return "/pos";
  }
}

/** Put the store on the screen a URL names, if the register can show it now. */
export function applyPath(pathname: string, search: string) {
  const s = posStore.get();
  const parts = pathname.replace(/\/+$/, "").split("/").slice(2); // after "/pos"
  const keepReceta = s.sheet?.mode === "receta" ? s.sheet : null;
  const sale = (extra: Partial<PosState> = {}) => posStore.set({ view: "sale", sheet: keepReceta, ...extra });

  if (parts[0] === "item" && parts[1]) {
    const id = decodeURIComponent(parts[1]);
    const idx = Number(new URLSearchParams(search).get("linea"));
    if (Number.isInteger(idx) && s.order[idx]?.id === id) return sale({ sheet: { mode: "edit", idx } });
    if (s.catalog.byId[id]) return sale({ sheet: { mode: "add", productId: id } });
    return sale();
  }
  if (parts[0] === "pay" && PAY.includes(parts[1] as PayMethod)) {
    const canPay = s.order.length > 0 || s.pending?.mode === "charge";
    if (!canPay) return sale();
    return posStore.set({ view: "tender", payMethod: parts[1] as PayMethod, sheet: null });
  }
  if (parts[0] === "done") {
    return s.lastTotal > 0 || s.receiptJobId ? posStore.set({ view: "done", sheet: null }) : sale();
  }
  if (parts[0] === "pedidos" && parts[1] && parts[2] === "personas") {
    if (s.pending?.id === parts[1]) return posStore.set({ view: "personas", split: true, sheet: null });
    const o = s.pendientes.find((x) => x.id === parts[1]);
    if (o) return chargePendingSplit(o);
    return openOrdenes();
  }
  if (parts[0] === "pedidos") return s.view === "ordenes" ? undefined : openOrdenes();
  if (parts[0] === "ventas") return s.view === "ventas" ? undefined : openVentas();
  if (s.view !== "etiquetas" && s.view !== "puntos") return sale();
}

const here = () => window.location.pathname + window.location.search;

/** Follow the URL; when the register can't show that screen, correct the URL in place. */
function syncFromUrl() {
  applyPath(window.location.pathname, window.location.search);
  const want = pathFor(posStore.get());
  if (here() !== want) window.history.replaceState(null, "", want);
}

/**
 * Keep the URL and the store in step: the store moves → push (or replace)
 * the URL; the back button moves the URL → `applyPath`. The first run reads
 * the URL the register was opened on.
 */
export function usePosRouting(ready: boolean) {
  const s = usePos();
  const want = pathFor(s);
  const view = s.view;
  const applied = React.useRef(false);
  const lastView = React.useRef(view);

  React.useEffect(() => {
    if (!ready || applied.current) return;
    applied.current = true;
    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, [ready]);

  React.useEffect(() => {
    if (!applied.current) return;
    const prev = lastView.current;
    lastView.current = view;
    if (here() === want) return;
    // Out of the receipt and into it the history is replaced: «back» from
    // the next sale must not reopen a finished payment.
    const replace = prev === "done" || view === "done";
    window.history[replace ? "replaceState" : "pushState"](null, "", want);
  }, [want, view]);
}

/** Go to a POS URL from a link-like control (same rules as the back button). */
export function goPos(path: string) {
  const u = new URL(path, window.location.origin);
  window.history.pushState(null, "", u.pathname + u.search);
  syncFromUrl();
}
