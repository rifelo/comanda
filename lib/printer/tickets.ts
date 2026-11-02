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
import { renderTicketHtml, tieneBebidas, type Papel, type RecetaLookup, type TicketDoc } from "./ticket";
import { DIALOGO_MS, TICKET_ATASCADO_MS, destinoTicket, equipoDe, type EstadoImpresoras, type Latido } from "./estaciones";

export interface TicketSettings {
  /** Where this device's tickets go. */
  modo: "aqui" | "caja" | "no";
  /** Receipt for every paid sale, or only when someone taps «Recibo». */
  recibo: "auto" | "pedir";
  /** A comanda for the bar with every new order. */
  comanda: boolean;
  /** Paper roll on this station's printer (58 mm roll in the 80 mm printer). */
  papel: Papel;
}
export interface TicketState extends TicketSettings {
  /** Spanish, user-facing: what happened to the last ticket. */
  note: string | null;
  /**
   * Did this browser's last print go straight to the printer (Edge with
   * --kiosk-printing) or open the print dialog? null = hasn't printed yet.
   * Remembered per device.
   */
  silencioso: boolean | null;
  /** The open receipt printer stations and the relay queue (heartbeat); null = not known yet. */
  impresoras: EstadoImpresoras | null;
}

const KEY = "pos:tickets";
const DEFAULTS: TicketSettings = { modo: "no", recibo: "pedir", comanda: true, papel: "80" };
const INITIAL: TicketState = { ...DEFAULTS, note: null, silencioso: null, impresoras: null };
const SILENCIOSO_KEY = "pos:tickets-silencioso";
const DEVICE_KEY = "pos:device-id";

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
    const sil = window.localStorage.getItem(SILENCIOSO_KEY);
    if (sil === "1" || sil === "0") state = { ...state, silencioso: sil === "1" };
  } catch { /* private mode: defaults */ }
}

// ── where the printer is (heartbeat, lib/printer/estaciones) ────
let deviceIdMem: string | null = null;
/** A random id for this browser, kept in localStorage: tells the stations apart. */
export function ticketDeviceId(): string {
  if (deviceIdMem) return deviceIdMem;
  let id: string | null = null;
  try { id = window.localStorage.getItem(DEVICE_KEY); } catch { /* private mode */ }
  if (!id || id.length < 8) {
    id = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
    try { window.localStorage.setItem(DEVICE_KEY, id); } catch { /* private mode */ }
  }
  deviceIdMem = id;
  return id;
}

/** What this device reports on its heartbeat. */
export function ticketLatido(): Latido {
  const s = getTicketState();
  return {
    deviceId: ticketDeviceId(),
    estacion: s.modo === "aqui"
      ? { equipo: equipoDe(navigator.userAgent).slice(0, 80), silencioso: s.silencioso, papel: s.papel }
      : null,
  };
}

/** The heartbeat's answer: the open stations and the queue. */
export function setTicketImpresoras(impresoras: EstadoImpresoras | null): void {
  load();
  set({ impresoras });
}

const DIALOGO_NOTE = "Este equipo abrió el cuadro de impresión. Ciérralo y abre el POS con el acceso «Co-manda POS» para imprimir directo.";
function markSilencioso(silencioso: boolean) {
  load();
  if (state.silencioso === silencioso) return;
  set({ silencioso, note: silencioso ? null : DIALOGO_NOTE });
  try { window.localStorage.setItem(SILENCIOSO_KEY, silencioso ? "1" : "0"); } catch { /* private mode */ }
  onSilencioso?.();
}
/** Lets the heartbeat report a change at once instead of on the next tick. */
let onSilencioso: (() => void) | null = null;
export function setOnTicketSilencioso(fn: (() => void) | null): void {
  onSilencioso = fn;
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
    const { modo, recibo, comanda, papel } = state;
    window.localStorage.setItem(KEY, JSON.stringify({ modo, recibo, comanda, papel }));
  } catch { /* private mode */ }
}

// ── receipt logo ────────────────────────────────────────────────
/**
 * The org's one-ink logo, kept as a data: URI so the hidden iframe prints it
 * at once (no load race) and offline; remembered per device with its URL.
 */
const LOGO_KEY = "pos:tickets-logo";
let logo: { url: string; data: string } | null = null;
let logoLoaded = false;
function loadLogo() {
  if (logoLoaded || typeof window === "undefined") return;
  logoLoaded = true;
  try {
    const raw = window.localStorage.getItem(LOGO_KEY);
    if (raw) logo = JSON.parse(raw) as { url: string; data: string };
  } catch { /* private mode */ }
}
export function setTicketLogo(url: string | null | undefined): void {
  loadLogo();
  if (!url) {
    logo = null;
    try { window.localStorage.removeItem(LOGO_KEY); } catch { /* private mode */ }
    return;
  }
  if (logo?.url === url) return;
  void fetch(url)
    .then(async (r) => {
      if (!r.ok) return;
      const blob = await r.blob();
      const data = await new Promise<string>((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result));
        fr.onerror = () => rej(fr.error);
        fr.readAsDataURL(blob);
      });
      logo = { url, data };
      try { window.localStorage.setItem(LOGO_KEY, JSON.stringify(logo)); } catch { /* full / private */ }
    })
    .catch(() => { /* offline: keep the remembered one */ });
}

// ── recipes (comanda de barra) ──────────────────────────────────
/**
 * The station's catalog by SKU: the comanda prints each drink's recipe from
 * here, so a relayed ticket carries only the SKU and the recipe is always the
 * one in the catalog right now.
 */
let recetas: RecetaLookup | undefined;
export function setTicketRecetas(fn: RecetaLookup | undefined): void {
  recetas = fn;
}
/** A comanda goes out only for orders with a prepared drink. */
export function comandaHace(doc: Pick<TicketDoc, "lines">): boolean {
  return tieneBebidas(doc, recetas);
}

// ── relay (stations without the printer) ────────────────────────
/** Queue tickets for the station; resolves the job ids, or null when it failed. */
type TicketRelay = (docs: TicketDoc[]) => Promise<string[] | null>;
/** How many of those jobs no station has taken yet; null = couldn't check. */
type TicketCheck = (ids: string[]) => Promise<number | null>;
let relay: TicketRelay | null = null;
let check: TicketCheck | null = null;
export function setTicketRelay(fn: TicketRelay | null, checker: TicketCheck | null = null) {
  relay = fn;
  check = checker;
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
    Object.assign(frame.style, { position: "fixed", left: "-10000px", top: "0", width: "72mm", height: "100px", border: "0" });
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
      // Images are in by onload; the brand faces may still be on their way
      // (first print, or offline before the SW cached them): wait for them,
      // but never more than 3 s — Arial Black is an acceptable fallback.
      const fonts = frame.contentDocument?.fonts;
      const ready = fonts ? Promise.race([fonts.ready, new Promise((r) => window.setTimeout(r, 3000))]) : Promise.resolve();
      void ready.then(() => {
        try {
          w.focus();
          // print() blocks while a dialog is open: its length tells whether
          // this browser prints straight to the printer.
          const t0 = performance.now();
          w.print();
          markSilencioso(performance.now() - t0 < DIALOGO_MS);
        } catch (err) {
          console.warn("[tickets] print failed:", err);
        }
        finish();
      });
    };
    frame.srcdoc = html;
    document.body.appendChild(frame);
    window.setTimeout(finish, 60_000); // never wedge the queue
  });
}

/** Print here, now (ticket station, or a ticket claimed from another station). */
export function printTicketHere(doc: TicketDoc): void {
  loadLogo();
  const html = renderTicketHtml(doc, { papel: getTicketState().papel, logo: logo?.data ?? null, recetas });
  chain = chain.then(() => printHtml(html)).catch((err) => console.warn("[tickets]", err));
}

/**
 * Should this device take relayed tickets? Only a station that prints here —
 * not one that opens the dialog while another prints straight (it relays
 * its own tickets there, and would otherwise grab them back).
 */
export function tomaTickets(): boolean {
  const s = getTicketState();
  return destinoTicket(s.modo, { deviceId: ticketDeviceId(), silencioso: s.silencioso }, s.impresoras?.estaciones ?? null).donde === "aqui";
}

/** This device prints tickets, here or through the station. */
export function ticketsOn(s: TicketSettings = getTicketState()): boolean {
  return s.modo !== "no";
}

/**
 * Print a ticket wherever the printer is (lib/printer/estaciones
 * destinoTicket): here when this is the ticket station and it prints
 * straight; relayed to the station otherwise — also from a station whose
 * browser opens the print dialog while another one prints straight. A
 * relayed ticket nobody takes within a few seconds is reported. Never
 * throws, never blocks the sale.
 */
export function printTicket(doc: TicketDoc): void {
  const s = getTicketState();
  const que = doc.kind === "recibo" ? "El recibo" : "La comanda";
  const d = destinoTicket(s.modo, { deviceId: ticketDeviceId(), silencioso: s.silencioso }, s.impresoras?.estaciones ?? null);
  if (d.donde === "ninguno") return;
  if (d.donde === "aqui") {
    printTicketHere(doc);
    if (s.silencioso !== false) set({ note: null });
    return;
  }
  if (!relay) {
    set({ note: "No se pudo enviar a la caja: recarga el punto de venta." });
    return;
  }
  const donde = d.estacion ? d.estacion.nombre : null;
  void relay([doc])
    .then((ids) => {
      if (!ids) return set({ note: `${que} no se pudo enviar a la caja. Revisa el internet y usa «Reimprimir».` });
      set({
        note: donde
          ? `${que} se envió a ${donde}.`
          : `${que} quedó en espera: ninguna caja con impresora está abierta (espera hasta 5 min).`,
      });
      if (!check || !ids.length) return;
      window.setTimeout(() => {
        void check!(ids)
          .then((sinTomar) => {
            if (sinTomar == null) return;
            if (sinTomar > 0) {
              set({ note: `${que} no ha salido: ${donde ? `${donde} no lo ha tomado` : "no hay caja con impresora abierta"}. Abre el POS en el equipo con la impresora.` });
            } else if (donde) {
              set({ note: `${que} llegó a ${donde}.` });
            }
          })
          .catch(() => { /* offline: the note stays */ });
      }, TICKET_ATASCADO_MS);
    })
    .catch(() => set({ note: `${que} no se pudo enviar a la caja. Revisa el internet y usa «Reimprimir».` }));
}

/** «Imprimir prueba» in the menu: a short receipt to check paper width and darkness. */
export function printTicketTest(orgName: string): void {
  printTicketHere({
    kind: "recibo",
    folio: "PRUEBA",
    at: new Date().toISOString(),
    orgName,
    encabezado: "Prueba de impresión · 80 mm",
    customer: "Prueba",
    lines: [
      { qty: 1, name: "Cappuccino", mods: ["Leche deslactosada"], total: 8500 },
      { qty: 2, name: "Pan de bono", mods: [], total: 7000 },
    ],
    total: 15500,
    method: "Efectivo",
    tendered: 20000,
    change: 4500,
    pie: "Si se ve completo, el ancho está bien.",
  });
}
