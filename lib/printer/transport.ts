/**
 * Serial transport + protocol client for the Niimbot B21S.
 *
 * Framework-free and testable: everything here talks to a `SerialPortLike`
 * (the Web Serial `SerialPort` shape), so lib/printer/transport.test.ts can
 * drive it with a fake port. lib/printer/serial.ts owns the browser side —
 * pairing, the store, the queue.
 *
 * Two things pyserial does implicitly that Web Serial does not, and that the
 * printer needs:
 *  · assert DTR + RTS after open — the B21S (a USB-CDC device) stays silent
 *    until the host raises DTR;
 *  · read whatever is available instead of a fixed block — `readable` already
 *    behaves that way, but replies still have to be re-framed across chunks.
 */

import {
  Cmd,
  HEAD_WIDTH_PX,
  LINE_BUFFER_ROWS,
  RESP_REJECTED,
  RESP_UNSUPPORTED,
  SERIAL_BAUD,
  decodePackets,
  parsePrintStatus,
  req,
  responseType,
  rowPacket,
  type Packet,
} from "./niimbot";
import type { LabelRaster } from "./label";

// ── Web Serial shapes (not in TS lib.dom yet) ───────────────────
export interface SerialPortInfo {
  usbVendorId?: number;
  usbProductId?: number;
}
export interface SerialPortLike extends EventTarget {
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  getInfo(): SerialPortInfo;
  setSignals?(signals: { dataTerminalReady?: boolean; requestToSend?: boolean }): Promise<void>;
}
export interface SerialLike extends EventTarget {
  requestPort(options?: { filters?: SerialPortInfo[] }): Promise<SerialPortLike>;
  getPorts(): Promise<SerialPortLike[]>;
}
declare global {
  interface Navigator {
    readonly serial?: SerialLike;
  }
}

// ── errors ──────────────────────────────────────────────────────
export class PrinterRejectedError extends Error {
  constructor(cmd: number) {
    super(`La impresora rechazó el comando 0x${cmd.toString(16)}.`);
    this.name = "PrinterRejectedError";
  }
}
export class PrinterTimeoutError extends Error {
  constructor(cmd: number) {
    super(`La impresora no respondió al comando 0x${cmd.toString(16)}.`);
    this.name = "PrinterTimeoutError";
  }
}

const hex = (u: Uint8Array) => Array.from(u, (b) => b.toString(16).padStart(2, "0")).join(" ");
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ── transport ───────────────────────────────────────────────────
export class SerialTransport {
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private buf: Uint8Array = new Uint8Array(0);
  private inbox: Packet[] = [];
  private waiters: Array<() => void> = [];
  private closed = false;
  /** Called once the read loop ends for any reason (cable pulled, close()). */
  onClosed: (() => void) | null = null;

  constructor(readonly port: SerialPortLike) {}

  async open() {
    await this.port.open({ baudRate: SERIAL_BAUD });
    if (!this.port.readable || !this.port.writable) throw new Error("puerto sin streams");
    // pyserial raises both on open; the printer won't answer without DTR.
    await this.port.setSignals?.({ dataTerminalReady: true, requestToSend: true });
    this.reader = this.port.readable.getReader();
    this.writer = this.port.writable.getWriter();
    void this.pump();
  }

  /** Background read loop: frames land in `inbox`, waiters are woken. */
  private async pump() {
    try {
      for (;;) {
        const { value, done } = await this.reader!.read();
        if (done) break;
        if (!value?.length) continue;
        const merged = new Uint8Array(this.buf.length + value.length);
        merged.set(this.buf);
        merged.set(value, this.buf.length);
        const { packets, rest } = decodePackets(merged);
        this.buf = rest;
        if (packets.length) {
          for (const p of packets) console.debug("[printer] rx", p.type.toString(16), hex(p.data));
          this.inbox.push(...packets);
        }
        this.wake();
      }
    } catch (err) {
      // Cable pulled mid-read: the stream errors. Treated as a disconnect.
      console.warn("[printer] read loop ended:", err);
    } finally {
      this.closed = true;
      this.wake();
      this.onClosed?.();
    }
  }

  private wake() {
    const w = this.waiters;
    this.waiters = [];
    w.forEach((f) => f());
  }

  private nextChunk(timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const t = setTimeout(() => resolve(false), timeoutMs);
      this.waiters.push(() => {
        clearTimeout(t);
        resolve(true);
      });
    });
  }

  async write(bytes: Uint8Array) {
    if (this.closed || !this.writer) throw new Error("puerto cerrado");
    await this.writer.write(bytes);
  }

  /**
   * Send a request and wait for its reply type. Replies for other types that
   * arrive meanwhile stay in the inbox (the printer occasionally re-sends).
   */
  async transceive(packet: Uint8Array, respType: number, timeoutMs = 1500): Promise<Packet> {
    const reqType = packet[2];
    console.debug("[printer] tx", reqType.toString(16), hex(packet.slice(4, packet.length - 3)));
    await this.write(packet);
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const i = this.inbox.findIndex(
        (p) => p.type === respType || p.type === RESP_REJECTED || p.type === RESP_UNSUPPORTED,
      );
      if (i >= 0) {
        const [p] = this.inbox.splice(i, 1);
        if (p.type === RESP_REJECTED) throw new PrinterRejectedError(reqType);
        if (p.type === RESP_UNSUPPORTED) throw new Error(`comando no soportado 0x${reqType.toString(16)}`);
        return p;
      }
      const left = deadline - Date.now();
      if (left <= 0 || this.closed) throw new PrinterTimeoutError(reqType);
      await this.nextChunk(left);
    }
  }

  async close() {
    this.closed = true;
    try {
      await this.reader?.cancel();
    } catch {}
    try {
      this.reader?.releaseLock();
      this.writer?.releaseLock();
    } catch {}
    try {
      await this.port.close();
    } catch {}
  }
}

// ── protocol client ─────────────────────────────────────────────
export class NiimbotClient {
  constructor(private t: SerialTransport) {}

  private async cmd(packet: Uint8Array) {
    return this.t.transceive(packet, responseType(packet[2]));
  }

  async freeRows(): Promise<number | null> {
    try {
      const p = await this.t.transceive(req.getPrintStatus(), responseType(Cmd.GET_PRINT_STATUS), 800);
      return parsePrintStatus(p.data).freeRows;
    } catch {
      return null;
    }
  }

  /** Block until the previous page has fully burned (buffer back to idle). */
  async waitIdle(timeoutMs = 30_000, threshold = LINE_BUFFER_ROWS - 10): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const free = await this.freeRows();
      if (free !== null && free >= threshold) return true;
      await sleep(200);
    }
    return false;
  }

  /**
   * The exact sequence that prints a complete label on B21S. Order matters:
   * ALLOW_PRINT_CLEAR before the page, SET_QUANTITY after the dimension, and
   * END_PRINT only once the buffer has drained.
   */
  async printRaster(raster: LabelRaster, density = 3, pollMs = 150) {
    if (raster.width !== HEAD_WIDTH_PX) throw new RangeError(`raster must be ${HEAD_WIDTH_PX}px wide`);
    await this.cmd(req.setDensity(density));
    await this.cmd(req.setLabelType(1));
    await this.cmd(req.startPrint());
    await this.cmd(req.allowPrintClear());
    await this.cmd(req.startPagePrint());
    await this.cmd(req.setDimension(raster.height, raster.width));
    await this.cmd(req.setQuantity(1));

    const baseline = (await this.freeRows()) ?? LINE_BUFFER_ROWS;
    // Only pace when a job could outrun the ~800-row buffer.
    const pace = raster.height > LINE_BUFFER_ROWS - 64;
    for (let y = 0; y < raster.rows.length; y++) {
      await this.t.write(rowPacket(y, raster.rows[y]));
      if (pace && (y + 1) % 16 === 0) await sleep(50);
    }

    await this.cmd(req.endPagePrint());
    await this.waitDrain(baseline, pollMs);
    await this.cmd(req.endPrint());
  }

  /** Wait for the line buffer to climb back to `target`; give up on a stall. */
  private async waitDrain(target: number, pollMs: number, timeoutMs = 60_000, settleMs = 3000) {
    const start = Date.now();
    let last: number | null = null;
    let lastChange = start;
    while (Date.now() - start < timeoutMs) {
      const free = await this.freeRows();
      if (free !== null) {
        if (free >= target) return true;
        if (free !== last) {
          last = free;
          lastChange = Date.now();
        }
      }
      if (Date.now() - lastChange > settleMs) return false;
      await sleep(pollMs);
    }
    return false;
  }
}
