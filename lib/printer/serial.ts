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
import { renderOrderLabel, renderTestLabel, type LabelRaster, type OrderLabelInput, renderInstagramLabel, renderMessageLabel, renderImageLabel, renderDrinkLabel, ensureLabelFonts, type DrinkLabelInput } from "./label";

// ── store ───────────────────────────────────────────────────────
export type PrinterStatus =
  | "unsupported" // no navigator.serial (Safari / Firefox / http over LAN)
  | "disconnected"
  | "connecting"
  | "ready"
  | "printing"
  /** Port open but the printer is powered down — USB stays enumerated when
   *  it's switched off with the button, so the OS never signals a disconnect. */
  | "off"
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
      stopMonitor();
      printerStore.set((s) => ({
        ...s,
        status: "disconnected",
        note: s.status === "printing" ? "La impresora se desconectó a mitad de la etiqueta." : s.note,
      }));
    }
  };
  transport = t;
  client = new NiimbotClient(t);
  // An open port only proves the USB interface is there. Ask the printer
  // something before calling it ready — switched off, it never answers.
  applyProbe(await probe());
  startMonitor();
}

const OFF_NOTE = "La impresora está apagada. Enciéndela con el botón; se reconecta sola.";
const PROBE_MS = 5000;
let monitor: ReturnType<typeof setInterval> | null = null;

/** True if the printer answers a status request (≤ 800 ms). */
async function probe(): Promise<boolean> {
  return !!client && (await client.freeRows()) !== null;
}

function applyProbe(alive: boolean) {
  printerStore.set((s) => {
    if (alive) return s.status === "ready" ? s : { ...s, status: "ready", note: null };
    return s.status === "off" ? s : { ...s, status: "off", note: OFF_NOTE };
  });
}

/**
 * Heartbeat while connected: flips ready ⇄ off as the printer is switched
 * off/on with the port still open. Skipped mid-job so it never interleaves
 * with a page being sent.
 */
function startMonitor() {
  stopMonitor();
  monitor = setInterval(() => {
    if (!client) return stopMonitor();
    const st = printerStore.get().status;
    if (st === "printing" || st === "connecting") return;
    void probe().then(applyProbe);
  }, PROBE_MS);
}
function stopMonitor() {
  if (monitor) clearInterval(monitor);
  monitor = null;
}

/** Manual "is it back?" check from the chip, without waiting for the next tick. */
export async function checkPrinter(): Promise<boolean> {
  if (!client) return false;
  const alive = await probe();
  applyProbe(alive);
  return alive;
}

function openErrorNote(err: unknown): string {
  const name = (err as { name?: string })?.name;
  // "already open": this tab still holds the port from before a code reload.
  if (name === "InvalidStateError") return "Recarga la página (Ctrl+R) para reconectar la impresora.";
  if (name === "NetworkError") {
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
  stopMonitor();
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
  /** May be async (e.g. an image label that has to load its bitmap first). */
  raster: () => LabelRaster | Promise<LabelRaster>;
  folio: string;
  name: string;
}
const queue: Job[] = [];
let draining = false;

/**
 * The line buffer reports idle as soon as the last row has burned, but the
 * B21S is still feeding the label to the tear-off. Starting the next page
 * right then makes it answer 219 (rejected), so labels get a breath between
 * them and a rejection is retried instead of being thrown away.
 */
const SETTLE_MS = 800;
const REJECT_RETRY_MS = 1500;
const MAX_REJECT_RETRIES = 2;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** What the queue needs from a printer; `NiimbotClient` satisfies it. */
export interface PrintTarget {
  waitIdle(timeoutMs?: number): Promise<boolean>;
  printRaster(raster: LabelRaster): Promise<unknown>;
}

/**
 * Print one label, waiting for the printer to be idle first and retrying
 * while it answers "busy" (219). Exported so the retry policy can be driven
 * against the fake B21S in the tests.
 */
export async function printJobWithRetry(
  target: PrintTarget,
  raster: () => LabelRaster | Promise<LabelRaster>,
  opts: {
    retries?: number;
    onRetry?: (attempt: number, of: number) => void;
    wait?: (ms: number) => Promise<void>;
  } = {},
): Promise<void> {
  const max = opts.retries ?? MAX_REJECT_RETRIES;
  const wait = opts.wait ?? sleep;
  for (let attempt = 0; ; attempt++) {
    try {
      await target.waitIdle();
      await target.printRaster(await raster());
      return;
    } catch (err) {
      // Busy, not broken: let the feed finish and send the page again.
      if (!(err instanceof PrinterRejectedError) || attempt >= max) throw err;
      opts.onRetry?.(attempt + 1, max);
      await wait(REJECT_RETRY_MS);
    }
  }
}

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
      // Switched off with the port still open: don't burn 30 s of timeouts
      // per label, check once and drop the queue with a clear message.
      if (printerStore.get().status === "off" && !(await probe())) {
        queue.length = 0;
        printerStore.set({ status: "off", queued: 0, note: "La impresora está apagada. Enciéndela y reimprime la etiqueta." });
        break;
      }
      printerStore.set({ status: "printing", note: null });
      try {
        // The brand face must be loaded before the canvas draws with it.
        await ensureLabelFonts();
        await printJobWithRetry(client, job.raster, {
          onRetry: (n, of) => {
            console.warn(`[printer] rejected, retry ${n}/${of}`);
            printerStore.set({
              status: "printing",
              note: `La impresora estaba ocupada. Reintentando (${n}/${of})…`,
            });
          },
        });
        printerStore.set({ status: "ready", lastPrinted: { folio: job.folio, name: job.name } });
        queue.shift();
        // The buffer reports idle before the paper stops moving; a breath
        // here keeps the next START_PRINT from being refused.
        if (queue.length) await sleep(SETTLE_MS);
        continue;
      } catch (err) {
        console.error("[printer] job failed:", err);
        printerStore.set({
          status: transport ? "error" : "disconnected",
          note:
            err instanceof PrinterRejectedError
              ? `La impresora rechazó la etiqueta tras ${MAX_REJECT_RETRIES} reintentos (${err.message}). Espera a que termine y reimprime.`
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

/** "Síguenos" QR label; `cupSrc` is the brand art drawn above the code. */
export function printInstagramLabel(handle: string, cupSrc?: string | null): void {
  enqueue({
    raster: async () => renderInstagramLabel({
      handle,
      orgName: labelDefaults.orgName,
      cup: cupSrc ? await loadImage(cupSrc) : null,
    }),
    folio: INSTAGRAM_FOLIO,
    name: `@${handle.replace(/^@/, "")}`,
  });
}
export const INSTAGRAM_FOLIO = "INSTAGRAM";

/** AI "frase del día" label for the cup. */
export function printMessageLabel(text: string, handle?: string | null, cupSrc?: string | null): void {
  enqueue({
    raster: async () => renderMessageLabel({
      text,
      orgName: labelDefaults.orgName,
      handle,
      cup: cupSrc ? await loadImage(cupSrc) : null,
    }),
    folio: FRASE_FOLIO,
    name: text,
  });
}
export const FRASE_FOLIO = "FRASE";

/** Brand sticker (e.g. /labels/payo-sticker.png) — image loaded when the job runs. */
export function printStickerLabel(src: string): void {
  enqueue({
    raster: async () => renderImageLabel(await loadImage(src)),
    folio: STICKER_FOLIO,
    name: "Sticker",
  });
}
export const STICKER_FOLIO = "STICKER";

/** Menu label for one drink (name, shots and descriptor) — one per cup. */
export function printDrinkLabel(input: DrinkLabelInput): void {
  enqueue({
    raster: () => renderDrinkLabel({ brand: labelDefaults.orgName, ...input }),
    folio: DRINK_FOLIO,
    name: input.name,
  });
}
export const DRINK_FOLIO = "BEBIDA";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo cargar la imagen del sticker."));
    img.src = src;
  });
}

export function printTestLabel(): void {
  enqueue({ raster: () => renderTestLabel(labelDefaults.station), folio: "PRUEBA", name: "" });
}
