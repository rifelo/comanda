"use client";

/**
 * Niimbot B21S over Web Serial — connection store, auto-reconnect, print queue.
 *
 * The register runs in Chrome/Edge on the Windows PC the printer is plugged
 * into, so the browser talks to COM4 directly through `navigator.serial`
 * (Chromium only; needs a secure context — Vercel HTTPS or localhost). No
 * local agent, no server round-trip: the label is rendered and sent from the
 * tab that took the order.
 *
 *  · Pairing needs one user gesture (`connectPrinter()` from the chip). After
 *    that the grant persists per origin and `usePrinterAutoConnect()` reopens
 *    the port on load and on the `connect` event when the cable comes back.
 *  · Jobs go through a serial queue that waits for the printer's line buffer
 *    to be idle between labels — the B21S rejects `START_PAGE_PRINT` (code
 *    219) if the previous page is still burning. Bench: 3 back-to-back
 *    labels, ~4.4 s each.
 *  · Printing never blocks the sale: `printOrderLabel` returns immediately and
 *    surfaces problems through the store's `note`, same idiom as the mic.
 *
 * Byte-level work lives in lib/printer/transport.ts (tested with a fake port).
 * Same store shape/pattern as app/pos/pos-store.ts so the terminal can read it
 * with useSyncExternalStore.
 */

import * as React from "react";
import { NIIMBOT_USB } from "./niimbot";
import {
  NiimbotClient,
  PrinterRejectedError,
  PrinterTimeoutError,
  SerialTransport,
  type SerialPortLike,
} from "./transport";
import { renderOrderLabel, renderTestLabel, type LabelRaster, type OrderLabelInput } from "./label";

// ── store ───────────────────────────────────────────────────────
export type PrinterStatus =
  | "unsupported" // no navigator.serial (Safari / Firefox / http over LAN)
  | "disconnected"
  | "connecting"
  | "ready"
  | "printing"
  | "error";

export interface PrinterState {
  status: PrinterStatus;
  /** Spanish, user-facing. Set on errors and on the reason we can't print. */
  note: string | null;
  /** Labels waiting behind the one printing. */
  queued: number;
  lastPrinted: { folio: string; name: string } | null;
}

export const PRINTER_INITIAL: PrinterState = {
  status: "disconnected",
  note: null,
  queued: 0,
  lastPrinted: null,
};

type Updater = Partial<PrinterState> | ((s: PrinterState) => PrinterState);
export const printerStore = (() => {
  let state: PrinterState = { ...PRINTER_INITIAL };
  const subs = new Set<() => void>();
  return {
    get: () => state,
    set: (u: Updater) => {
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

export function usePrinter(): PrinterState {
  return React.useSyncExternalStore(printerStore.sub, printerStore.get, () => PRINTER_INITIAL);
}

export function isSerialSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.serial;
}

function unsupportedNote(): string {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "La impresora solo funciona en HTTPS (o localhost). Abre el POS en el sitio seguro.";
  }
  return "Este navegador no puede usar la impresora. Usa Chrome o Edge en el PC de la caja.";
}

// ── connection lifecycle ────────────────────────────────────────
let transport: SerialTransport | null = null;
let client: NiimbotClient | null = null;

function isNiimbot(port: SerialPortLike): boolean {
  const i = port.getInfo();
  return i.usbVendorId === NIIMBOT_USB.usbVendorId && i.usbProductId === NIIMBOT_USB.usbProductId;
}

async function attach(port: SerialPortLike) {
  if (transport) return; // already connected
  printerStore.set({ status: "connecting", note: null });
  const t = new SerialTransport(port);
  try {
    await t.open();
  } catch (err) {
    console.warn("[printer] open failed:", err);
    printerStore.set({ status: "error", note: openErrorNote(err) });
    return;
  }
  t.onClosed = () => {
    if (transport === t) {
      transport = null;
      client = null;
      printerStore.set((s) => ({
        ...s,
        status: "disconnected",
        note: s.status === "printing" ? "La impresora se desconectó a mitad de la etiqueta." : s.note,
      }));
    }
  };
  transport = t;
  client = new NiimbotClient(t);
  printerStore.set({ status: "ready", note: null });
}

function openErrorNote(err: unknown): string {
  const name = (err as { name?: string })?.name;
  if (name === "InvalidStateError" || name === "NetworkError") {
    return "No se pudo abrir la impresora. Cierra la app NIIMBOT si está abierta: retiene el puerto.";
  }
  return "No se pudo abrir la impresora. Revisa el cable USB y que esté encendida.";
}

/**
 * Pair with the printer. Must run from a click — the browser only shows the
 * port picker inside a user gesture. Filtered to the B21S's USB ids so the
 * cashier sees one entry, not every COM port on the machine.
 */
export async function connectPrinter(): Promise<void> {
  if (!isSerialSupported()) {
    printerStore.set({ status: "unsupported", note: unsupportedNote() });
    return;
  }
  if (transport) return;
  let port: SerialPortLike;
  try {
    port = await navigator.serial!.requestPort({ filters: [NIIMBOT_USB] });
  } catch (err) {
    // NotFoundError = user closed the picker; not an error worth showing.
    if ((err as { name?: string })?.name !== "NotFoundError") console.warn("[printer] requestPort:", err);
    return;
  }
  await attach(port);
}

/** Reopen a previously granted port, if the printer is plugged in. */
async function autoConnect(): Promise<void> {
  if (!isSerialSupported() || transport) return;
  try {
    const ports = (await navigator.serial!.getPorts()).filter(isNiimbot);
    if (ports.length) await attach(ports[0]);
  } catch (err) {
    console.warn("[printer] getPorts:", err);
  }
}

export async function disconnectPrinter(): Promise<void> {
  const t = transport;
  transport = null;
  client = null;
  if (t) await t.close();
  printerStore.set({ status: "disconnected", note: null });
}

/**
 * Mount once in the terminal: reconnects on load and tracks the cable.
 * `connect`/`disconnect` fire on navigator.serial for ports this origin has
 * been granted, which is exactly the "is the printer plugged in" signal.
 */
export function usePrinterAutoConnect() {
  React.useEffect(() => {
    if (!isSerialSupported()) {
      printerStore.set({ status: "unsupported", note: unsupportedNote() });
      return;
    }
    void autoConnect();
    const onConnect = () => void autoConnect();
    const onDisconnect = (e: Event) => {
      if (transport && e.target === transport.port) void disconnectPrinter();
    };
    const serial = navigator.serial!;
    serial.addEventListener("connect", onConnect);
    serial.addEventListener("disconnect", onDisconnect);
    return () => {
      serial.removeEventListener("connect", onConnect);
      serial.removeEventListener("disconnect", onDisconnect);
    };
  }, []);
}

// ── print queue ─────────────────────────────────────────────────
interface Job {
  raster: () => LabelRaster;
  folio: string;
  name: string;
}
const queue: Job[] = [];
let draining = false;

function enqueue(job: Job) {
  queue.push(job);
  printerStore.set((s) => ({ ...s, queued: queue.length - (draining ? 1 : 0) }));
  if (!draining) void drain();
}

async function drain() {
  draining = true;
  try {
    while (queue.length) {
      const job = queue[0];
      printerStore.set((s) => ({ ...s, queued: queue.length - 1 }));
      if (!client) {
        // Not connected: drop the queue rather than pile up labels for later.
        queue.length = 0;
        printerStore.set((s) => ({
          ...s,
          queued: 0,
          note: s.status === "unsupported" ? s.note : "Impresora no conectada. La etiqueta no se imprimió.",
        }));
        break;
      }
      printerStore.set({ status: "printing", note: null });
      try {
        await client.waitIdle();
        await client.printRaster(job.raster());
        printerStore.set({ status: "ready", lastPrinted: { folio: job.folio, name: job.name } });
      } catch (err) {
        console.error("[printer] job failed:", err);
        printerStore.set({
          status: transport ? "error" : "disconnected",
          note:
            err instanceof PrinterRejectedError
              ? "La impresora rechazó la etiqueta. Espera a que termine la anterior y reimprime."
              : err instanceof PrinterTimeoutError
                ? "La impresora no responde. Revisa el cable y que esté encendida."
                : "No se pudo imprimir la etiqueta.",
        });
      }
      queue.shift();
    }
  } finally {
    draining = false;
    printerStore.set((s) => ({ ...s, queued: 0 }));
  }
}

/** Station / business shown on every label; set once by the terminal on mount. */
let labelDefaults: Pick<OrderLabelInput, "station" | "orgName"> = {};
export function setLabelDefaults(d: Pick<OrderLabelInput, "station" | "orgName">) {
  labelDefaults = { ...labelDefaults, ...d };
}

/**
 * Fire-and-forget: called from completeSale on success. Never throws, never
 * blocks the receipt; failures show on the printer chip.
 */
export function printOrderLabel(input: OrderLabelInput): void {
  const full = { ...labelDefaults, ...input };
  enqueue({
    raster: () => renderOrderLabel(full),
    folio: full.folio,
    name: full.name.trim(),
  });
}

export function printTestLabel(): void {
  enqueue({ raster: () => renderTestLabel(labelDefaults.station), folio: "PRUEBA", name: "" });
}
