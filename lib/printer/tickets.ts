"use client";

/**
 * Receipt printer station — the browser side of lib/printer/ticket.ts.
 *
 * The DIG-E200I is installed on the register PC as a normal Windows printer,
 * so a ticket is a small HTML page printed from a hidden iframe. With Edge
 * started with `--kiosk-printing` and the DIG-E200I as the default printer,
 * `print()` goes straight to it with no dialog; without the flag the
 * browser's print dialog opens (handy to test).
 *
 * Each device says where its tickets go (POS «⋯» menu, kept in localStorage):
 *   · aquí  — this PC has the printer (the «ticket station»);
 *   · caja  — relayed through pos_print_jobs (clase 'ticket'); the station
 *             claims and prints them, the way the tablets' labels reach the
 *             Niimbot;
 *   · no    — no paper tickets from this device (the default).
 */
import * as React from "react";
import { renderTicketHtml, type TicketDoc } from "./ticket";

export interface TicketSettings {
  /** Where this device's tickets go. */
  modo: "aqui" | "caja" | "no";
  /** Receipt for every paid sale, or only when someone taps «Recibo». */
  recibo: "auto" | "pedir";
  /** A comanda for the bar with every new order. */
  comanda: boolean;
}
export interface TicketState extends TicketSettings {
  /** Spanish, user-facing: what happened to the last ticket. */
  note: string | null;
}

const KEY = "pos:tickets";
const DEFAULTS: TicketSettings = { modo: "no", recibo: "pedir", comanda: true };
const INITIAL: TicketState = { ...DEFAULTS, note: null };

let state: TicketState = INITIAL;
let loaded = false;
const subs = new Set<() => void>();
function set(patch: Partial<TicketState>) {
  state = { ...state, ...patch };
  subs.forEach((f) => f());
}
function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) state = { ...state, ...DEFAULTS, ...(JSON.parse(raw) as Partial<TicketSettings>) };
  } catch { /* private mode: defaults */ }
}

export function getTicketState(): TicketState {
  load();
  return state;
}
export function useTicketPrinter(): TicketState {
  return React.useSyncExternalStore(
    (f) => { subs.add(f); return () => { subs.delete(f); }; },
    getTicketState,
    () => INITIAL,
  );
}

export function setTicketSettings(patch: Partial<TicketSettings>) {
  load();
  set({ ...patch, note: null });
  try {
    const { modo, recibo, comanda } = state;
    window.localStorage.setItem(KEY, JSON.stringify({ modo, recibo, comanda }));
  } catch { /* private mode */ }
}

// ── relay (stations without the printer) ────────────────────────
type TicketRelay = (docs: TicketDoc[]) => Promise<boolean>;
let relay: TicketRelay | null = null;
export function setTicketRelay(fn: TicketRelay | null) {
  relay = fn;
}

// ── printing ────────────────────────────────────────────────────
/** One ticket at a time: two print() calls racing confuse the spooler. */
let chain: Promise<void> = Promise.resolve();

function printHtml(html: string): Promise<void> {
  return new Promise((resolve) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    // Off screen but laid out at paper width, so the page measures right.
    Object.assign(frame.style, { position: "fixed", left: "-10000px", top: "0", width: "80mm", height: "100px", border: "0" });
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      // print() returns once the job is spooled (kiosk) or the dialog closes.
      window.setTimeout(() => { frame.remove(); resolve(); }, 500);
    };
    frame.onload = () => {
      const w = frame.contentWindow;
      if (!w) return finish();
      try {
        w.focus();
        w.print();
      } catch (err) {
        console.warn("[tickets] print failed:", err);
      }
      finish();
    };
    frame.srcdoc = html;
    document.body.appendChild(frame);
    window.setTimeout(finish, 60_000); // never wedge the queue
  });
}

/** Print here, now (ticket station, or a ticket claimed from another station). */
export function printTicketHere(doc: TicketDoc): void {
  const html = renderTicketHtml(doc);
  chain = chain.then(() => printHtml(html)).catch((err) => console.warn("[tickets]", err));
}

/** This device prints tickets, here or through the station. */
export function ticketsOn(s: TicketSettings = getTicketState()): boolean {
  return s.modo !== "no";
}

/**
 * Print a ticket wherever the printer is: here when this is the ticket
 * station, relayed to it when the device sends to the register, nowhere when
 * paper tickets are off here. Never throws, never blocks the sale.
 */
export function printTicket(doc: TicketDoc): void {
  const s = getTicketState();
  const [sent, failed] = doc.kind === "recibo"
    ? ["Recibo enviado a la caja con impresora", "No se pudo enviar el recibo a la caja."]
    : ["Comanda enviada a la caja con impresora", "No se pudo enviar la comanda a la caja."];
  if (s.modo === "no") return;
  if (s.modo === "aqui") {
    printTicketHere(doc);
    set({ note: null });
    return;
  }
  if (!relay) {
    set({ note: "No se pudo enviar a la caja: recarga el punto de venta." });
    return;
  }
  void relay([doc])
    .then((ok) => set({ note: ok ? sent : failed }))
    .catch(() => set({ note: failed }));
}

/** «Imprimir prueba» in the menu: a short receipt to check paper width and darkness. */
export function printTicketTest(orgName: string): void {
  printTicketHere({
    kind: "recibo",
    folio: "PRUEBA",
    at: new Date().toISOString(),
    orgName,
    encabezado: "Prueba de impresión · 80 mm",
    lines: [
      { qty: 1, name: "Cappuccino", mods: ["Mediano", "Leche deslactosada"], total: 8500 },
      { qty: 2, name: "Pan de bono", mods: [], total: 7000 },
    ],
    total: 15500,
    method: "Efectivo",
    tendered: 20000,
    change: 4500,
    pie: "Si este texto se ve completo y centrado, el ancho está bien.",
  });
}
