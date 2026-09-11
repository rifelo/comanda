/**
 * Niimbot B21S wire protocol — pure byte-level encoding, no I/O.
 *
 * Every frame is `55 55 <type> <len> <data…> <xor> aa aa`, where the xor
 * checksum covers type, len and data. The printer answers a request of type
 * `t` with type `t + offset` (offset is 1 for most commands, 16 for a few,
 * and the info key itself for GET_INFO); type 219 means "rejected" and type
 * 0 means "unsupported".
 *
 * Ported from the serial half of AndBondStyle/niimprint (MIT, orig.
 * kjy00302) after a day of bench-testing against a real B21S. The B21S
 * differs from the B21 that library targets in four ways that are not
 * documented anywhere — see NOTES below; the transport layer
 * (lib/printer/serial.ts) relies on all of them.
 *
 * NOTES (B21S vs B21):
 *  · ALLOW_PRINT_CLEAR + SET_QUANTITY are *required* to commit a page. niimprint
 *    disables them for B21; without them the printer buffers rows and only
 *    flushes once ~500 pile up, so a single label prints partially or not at all.
 *  · GET_PRINT_STATUS returns 8 bytes, not 4. Bytes 4-5 are the free slots in
 *    the printer's line buffer (799 when idle) — the only trustworthy "is it
 *    done" signal; the progress fields sit at a stale 100/100 on short jobs.
 *  · GET_RFID appends trailing bytes after the 5-byte tail; slice, don't unpack.
 *  · Every row packet must carry the full 384-dot line (48 bytes). Narrower rows
 *    are unparseable and the printer prints nothing.
 */

// ── constants ───────────────────────────────────────────────────
/** Print head width in dots. Every raster row is exactly this wide. */
export const HEAD_WIDTH_PX = 384;
export const HEAD_WIDTH_BYTES = HEAD_WIDTH_PX / 8;
/** 203 dpi ≈ 8 dots per millimetre, both axes. */
export const PX_PER_MM = 8;
/** Free line-buffer slots reported by an idle printer. */
export const LINE_BUFFER_ROWS = 799;
export const SERIAL_BAUD = 115200;
/** USB identity of the B21S, for Web Serial port filters. */
export const NIIMBOT_USB = { usbVendorId: 0x3513, usbProductId: 0x0002 } as const;

export const Cmd = {
  GET_INFO: 0x40,
  GET_RFID: 0x1a,
  HEARTBEAT: 0xdc,
  SET_LABEL_TYPE: 0x23,
  SET_LABEL_DENSITY: 0x21,
  START_PRINT: 0x01,
  END_PRINT: 0xf3,
  START_PAGE_PRINT: 0x03,
  END_PAGE_PRINT: 0xe3,
  ALLOW_PRINT_CLEAR: 0x20,
  SET_DIMENSION: 0x13,
  SET_QUANTITY: 0x15,
  GET_PRINT_STATUS: 0xa3,
  IMAGE_ROW: 0x85,
} as const;
export type CmdType = (typeof Cmd)[keyof typeof Cmd];

export const Info = {
  DENSITY: 1,
  DEVICETYPE: 8,
  SOFTVERSION: 9,
  BATTERY: 10,
  DEVICESERIAL: 11,
  HARDVERSION: 12,
} as const;

/** Reply type = request type + this offset (1 unless listed). */
const RESP_OFFSET: Partial<Record<number, number>> = {
  [Cmd.SET_LABEL_TYPE]: 16,
  [Cmd.SET_LABEL_DENSITY]: 16,
  [Cmd.ALLOW_PRINT_CLEAR]: 16,
  [Cmd.GET_PRINT_STATUS]: 16,
};
export function responseType(reqType: number, infoKey?: number): number {
  if (reqType === Cmd.GET_INFO && infoKey !== undefined) return infoKey;
  return reqType + (RESP_OFFSET[reqType] ?? 1);
}

export const RESP_REJECTED = 219;
export const RESP_UNSUPPORTED = 0;

// ── framing ─────────────────────────────────────────────────────
export interface Packet {
  type: number;
  data: Uint8Array;
}

function xorChecksum(type: number, data: Uint8Array): number {
  let c = type ^ data.length;
  for (let i = 0; i < data.length; i++) c ^= data[i];
  return c & 0xff;
}

export function encodePacket(type: number, data: Uint8Array | number[] = []): Uint8Array {
  const d = data instanceof Uint8Array ? data : Uint8Array.from(data);
  if (d.length > 255) throw new RangeError(`packet data too long: ${d.length}`);
  const out = new Uint8Array(d.length + 7);
  out[0] = 0x55;
  out[1] = 0x55;
  out[2] = type;
  out[3] = d.length;
  out.set(d, 4);
  out[4 + d.length] = xorChecksum(type, d);
  out[5 + d.length] = 0xaa;
  out[6 + d.length] = 0xaa;
  return out;
}

/**
 * Pull every complete, well-formed frame out of `buf`. Bytes that don't start
 * a valid frame are skipped one at a time (the link occasionally carries
 * garbage between replies). Returns the frames plus whatever incomplete tail
 * should be kept for the next read.
 */
export function decodePackets(buf: Uint8Array): { packets: Packet[]; rest: Uint8Array } {
  const packets: Packet[] = [];
  let i = 0;
  while (i < buf.length) {
    if (buf[i] !== 0x55 || buf[i + 1] !== 0x55) {
      i++;
      continue;
    }
    if (i + 4 > buf.length) break; // need type + len
    const type = buf[i + 2];
    const len = buf[i + 3];
    const end = i + 4 + len + 3;
    if (end > buf.length) break; // frame not fully received yet
    const data = buf.slice(i + 4, i + 4 + len);
    const ok =
      buf[end - 3] === xorChecksum(type, data) && buf[end - 2] === 0xaa && buf[end - 1] === 0xaa;
    if (!ok) {
      i++;
      continue;
    }
    packets.push({ type, data });
    i = end;
  }
  return { packets, rest: buf.slice(i) };
}

// ── request builders ────────────────────────────────────────────
const u16 = (n: number): number[] => [(n >> 8) & 0xff, n & 0xff];

export const req = {
  setDensity: (n: number) => encodePacket(Cmd.SET_LABEL_DENSITY, [clamp(n, 1, 5)]),
  /** 1 = gap labels (die-cut on a liner), which is what the B21S ships with. */
  setLabelType: (n = 1) => encodePacket(Cmd.SET_LABEL_TYPE, [clamp(n, 1, 3)]),
  startPrint: () => encodePacket(Cmd.START_PRINT, [1]),
  allowPrintClear: () => encodePacket(Cmd.ALLOW_PRINT_CLEAR, [1]),
  startPagePrint: () => encodePacket(Cmd.START_PAGE_PRINT, [1]),
  /**
   * Page geometry as (rows along the feed, dots across the head). Confirmed
   * on B21S: swapping them clips the across axis to the second value.
   */
  setDimension: (rows: number, width = HEAD_WIDTH_PX) =>
    encodePacket(Cmd.SET_DIMENSION, [...u16(rows), ...u16(width)]),
  setQuantity: (n = 1) => encodePacket(Cmd.SET_QUANTITY, u16(clamp(n, 1, 0xffff))),
  endPagePrint: () => encodePacket(Cmd.END_PAGE_PRINT, [1]),
  endPrint: () => encodePacket(Cmd.END_PRINT, [1]),
  getPrintStatus: () => encodePacket(Cmd.GET_PRINT_STATUS, [1]),
  heartbeat: () => encodePacket(Cmd.HEARTBEAT, [1]),
  getInfo: (key: number) => encodePacket(Cmd.GET_INFO, [key]),
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

/**
 * One raster row as an IMAGE_ROW packet. `line` is 48 bytes, MSB-first, bit
 * set = burn (black). The three counts are black dots per third of the row —
 * niimprint zeroes them; we send real values since the head width is fixed
 * and computing them is free.
 */
export function rowPacket(y: number, line: Uint8Array): Uint8Array {
  if (line.length !== HEAD_WIDTH_BYTES) {
    throw new RangeError(`row must be ${HEAD_WIDTH_BYTES} bytes, got ${line.length}`);
  }
  const third = HEAD_WIDTH_BYTES / 3; // 16 bytes = 128 dots
  const counts = [0, 1, 2].map((k) => {
    let n = 0;
    for (let b = k * third; b < (k + 1) * third; b++) n += POPCOUNT[line[b]];
    return Math.min(255, n);
  });
  const data = new Uint8Array(6 + HEAD_WIDTH_BYTES);
  data[0] = (y >> 8) & 0xff;
  data[1] = y & 0xff;
  data[2] = counts[0];
  data[3] = counts[1];
  data[4] = counts[2];
  data[5] = 1; // repeat count
  data.set(line, 6);
  return encodePacket(Cmd.IMAGE_ROW, data);
}

const POPCOUNT: number[] = Array.from({ length: 256 }, (_, v) => {
  let n = 0;
  for (let x = v; x; x >>= 1) n += x & 1;
  return n;
});

// ── response parsers ────────────────────────────────────────────
export interface PrintStatus {
  page: number;
  progress1: number;
  progress2: number;
  /** Free slots in the line buffer; LINE_BUFFER_ROWS when idle. */
  freeRows: number | null;
}
export function parsePrintStatus(data: Uint8Array): PrintStatus {
  return {
    page: (data[0] << 8) | data[1],
    progress1: data[2],
    progress2: data[3],
    freeRows: data.length >= 6 ? (data[4] << 8) | data[5] : null,
  };
}

export interface Heartbeat {
  powerLevel: number | null;
}
/** Only the battery is stable across the B21S's variable-length replies. */
export function parseHeartbeat(data: Uint8Array): Heartbeat {
  const n = data.length;
  const powerLevel = n === 13 ? data[10] : n === 19 ? data[16] : n === 10 ? data[9] : null;
  return { powerLevel };
}

export function parseInfo(key: number, data: Uint8Array): string | number {
  if (key === Info.DEVICESERIAL) {
    return Array.from(data, (b) => String.fromCharCode(b)).join("");
  }
  let n = 0;
  for (const b of data) n = (n << 8) | b;
  if (key === Info.SOFTVERSION || key === Info.HARDVERSION) return n / 100;
  return n;
}
