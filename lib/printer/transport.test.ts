import { describe, it, expect, vi } from "vitest";
import {
  Cmd,
  HEAD_WIDTH_BYTES,
  HEAD_WIDTH_PX,
  LINE_BUFFER_ROWS,
  NIIMBOT_USB,
  RESP_REJECTED,
  decodePackets,
  encodePacket,
  responseType,
  type Packet,
} from "@/lib/printer/niimbot";
import {
  NiimbotClient,
  PrinterRejectedError,
  PrinterStalledError,
  PrinterTimeoutError,
  SerialTransport,
  type SerialPortLike,
} from "@/lib/printer/transport";
import { printJobWithRetry } from "@/lib/printer/serial";

vi.spyOn(console, "warn").mockImplementation(() => {}); // silence the wire trace

/**
 * A SerialPort stand-in wired to a tiny B21S model: every request gets the
 * reply the real printer gave on the bench, rows drain the line buffer, and
 * END_PAGE_PRINT starts refilling it.
 */
class FakePort extends EventTarget implements SerialPortLike {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  sent: Packet[] = [];
  signals: Record<string, boolean> = {};
  free = LINE_BUFFER_ROWS;
  burning = false;
  private ctrl!: ReadableStreamDefaultController<Uint8Array>;

  constructor(private reply: (p: Packet, port: FakePort) => Uint8Array | null | undefined = defaultReply) {
    super();
    this.readable = new ReadableStream({ start: (c) => void (this.ctrl = c) });
    this.writable = new WritableStream({
      write: (chunk) => {
        for (const p of decodePackets(chunk).packets) {
          this.sent.push(p);
          const r = this.reply(p, this);
          if (r) this.ctrl.enqueue(r);
        }
      },
    });
  }
  async open() {}
  async close() {
    try {
      this.ctrl.close();
    } catch {}
  }
  getInfo() {
    return NIIMBOT_USB;
  }
  async setSignals(s: { dataTerminalReady?: boolean; requestToSend?: boolean }) {
    Object.assign(this.signals, s);
  }
}

const ack = (type: number) => encodePacket(responseType(type), [1]);

function defaultReply(p: Packet, port: FakePort): Uint8Array | null {
  switch (p.type) {
    case Cmd.IMAGE_ROW:
      port.free -= 1;
      return null;
    case Cmd.END_PAGE_PRINT:
      port.burning = true;
      return ack(p.type);
    case Cmd.GET_PRINT_STATUS: {
      if (port.burning) port.free = Math.min(LINE_BUFFER_ROWS, port.free + 300);
      if (port.free >= LINE_BUFFER_ROWS) port.burning = false;
      return encodePacket(responseType(p.type), [0, 0, 100, 100, port.free >> 8, port.free & 0xff, 0, 0]);
    }
    default:
      return ack(p.type);
  }
}

async function connect(port: FakePort, unlockAll = false) {
  const t = new SerialTransport(port);
  await t.open();
  const c = new NiimbotClient(t);
  // The app defaults to the unlock sequence; most tests exercise the plain one.
  c.unlockAll = unlockAll;
  return { t, c };
}

const raster = (rows: number) => ({
  width: HEAD_WIDTH_PX,
  height: rows,
  rows: Array.from({ length: rows }, () => new Uint8Array(HEAD_WIDTH_BYTES)),
});

describe("SerialTransport", () => {
  it("raises DTR and RTS on open — the printer stays silent without them", async () => {
    const port = new FakePort();
    const { t } = await connect(port);
    expect(port.signals).toEqual({ dataTerminalReady: true, requestToSend: true });
    await t.close();
  });

  it("matches a reply to its request type", async () => {
    const port = new FakePort();
    const { t } = await connect(port);
    const p = await t.transceive(encodePacket(Cmd.HEARTBEAT, [1]), responseType(Cmd.HEARTBEAT));
    expect(p.type).toBe(responseType(Cmd.HEARTBEAT));
    await t.close();
  });

  it("re-frames a reply split across two chunks", async () => {
    const port = new FakePort((p, self) => {
      const r = ack(p.type);
      // enqueue the head now and the tail on the next tick
      const [a, b] = [r.slice(0, 3), r.slice(3)];
      setTimeout(() => (self as unknown as { ctrl: ReadableStreamDefaultController<Uint8Array> }).ctrl.enqueue(b), 5);
      return a;
    });
    const { t } = await connect(port);
    const p = await t.transceive(encodePacket(Cmd.START_PRINT, [1]), responseType(Cmd.START_PRINT));
    expect(p.type).toBe(responseType(Cmd.START_PRINT));
    await t.close();
  });

  it("throws PrinterRejectedError on a 219 reply", async () => {
    const port = new FakePort(() => encodePacket(219, []));
    const { t } = await connect(port);
    await expect(t.transceive(encodePacket(Cmd.START_PAGE_PRINT, [1]), 0x04)).rejects.toBeInstanceOf(PrinterRejectedError);
    await t.close();
  });

  it("throws PrinterTimeoutError when nothing comes back", async () => {
    const port = new FakePort(() => null);
    const { t } = await connect(port);
    await expect(t.transceive(encodePacket(Cmd.START_PRINT, [1]), 0x02, 30)).rejects.toBeInstanceOf(PrinterTimeoutError);
    await t.close();
  });
});

describe("NiimbotClient.printRaster", () => {
  it("sends the B21S sequence in order, every row, then drains before END_PRINT", async () => {
    const port = new FakePort();
    const { t, c } = await connect(port);
    await c.printRaster(raster(240), 3, 1);
    const types = port.sent.map((p) => p.type);
    const cmds = types.filter((x) => x !== Cmd.IMAGE_ROW && x !== Cmd.GET_PRINT_STATUS);
    expect(cmds).toEqual([
      Cmd.SET_LABEL_DENSITY,
      Cmd.SET_LABEL_TYPE,
      Cmd.START_PRINT,
      Cmd.ALLOW_PRINT_CLEAR,
      Cmd.START_PAGE_PRINT,
      Cmd.SET_DIMENSION,
      Cmd.SET_QUANTITY,
      Cmd.END_PAGE_PRINT,
      Cmd.END_PRINT,
    ]);
    expect(types.filter((x) => x === Cmd.IMAGE_ROW)).toHaveLength(240);
    // dimension = (rows, 384)
    const dim = port.sent.find((p) => p.type === Cmd.SET_DIMENSION)!;
    expect(Array.from(dim.data)).toEqual([0, 240, 1, 128]);
    // END_PRINT only after the buffer came back to idle
    const endPrintAt = types.lastIndexOf(Cmd.END_PRINT);
    const lastStatusBefore = types.slice(0, endPrintAt).lastIndexOf(Cmd.GET_PRINT_STATUS);
    expect(lastStatusBefore).toBeGreaterThan(types.indexOf(Cmd.END_PAGE_PRINT));
    expect(port.free).toBe(LINE_BUFFER_ROWS);
    await t.close();
  });

  it("prints an unlock raster (50 × 50): session opened as continuous, switched to gap before the page", async () => {
    const port = new FakePort();
    const { t, c } = await connect(port);
    await c.printRaster({ ...raster(400), unlock: true }, 3, 1);
    const types = port.sent.map((p) => p.type);
    const cmds = types.filter((x) => x !== Cmd.IMAGE_ROW && x !== Cmd.GET_PRINT_STATUS);
    expect(cmds).toEqual([
      Cmd.SET_LABEL_DENSITY,
      Cmd.SET_LABEL_TYPE,
      Cmd.START_PRINT,
      Cmd.SET_LABEL_TYPE,
      Cmd.ALLOW_PRINT_CLEAR,
      Cmd.START_PAGE_PRINT,
      Cmd.SET_DIMENSION,
      Cmd.SET_QUANTITY,
      Cmd.END_PAGE_PRINT,
      Cmd.END_PRINT,
    ]);
    expect(port.sent.filter((p) => p.type === Cmd.SET_LABEL_TYPE).map((p) => p.data[0])).toEqual([3, 1]);
    // the design, then the tear-off tail of blank rows
    expect(types.filter((x) => x === Cmd.IMAGE_ROW)).toHaveLength(400 + NiimbotClient.UNLOCK_TAIL_ROWS);
    // dimension = (rows + tail, 384): no lead-in, the printer finds the gap itself
    const dim = 400 + NiimbotClient.UNLOCK_TAIL_ROWS;
    expect(Array.from(port.sent.find((p) => p.type === Cmd.SET_DIMENSION)!.data)).toEqual([dim >> 8, dim & 0xff, 1, 128]);
    await t.close();
  });

  it("reports an unlock job whose rows never burn as stalled (never resent), after closing the session", async () => {
    // A printer that takes the page but never drains it (the chip stall).
    const port = new FakePort((p, self) => {
      if (p.type === Cmd.IMAGE_ROW) { self.free -= 1; return null; }
      if (p.type === Cmd.GET_PRINT_STATUS) return encodePacket(responseType(p.type), [0, 8, 100, 100, self.free >> 8, self.free & 0xff, 0x14, 1]);
      return encodePacket(responseType(p.type), [1]);
    });
    const { t, c } = await connect(port);
    await expect(c.printRaster({ ...raster(400), unlock: true }, 3, 1)).rejects.toBeInstanceOf(PrinterStalledError);
    expect(port.sent[port.sent.length - 1].type).toBe(Cmd.END_PRINT);
    // the queue only retries rejections: a stall must not look like one
    expect(new PrinterStalledError()).not.toBeInstanceOf(PrinterRejectedError);
    await t.close();
  });

  it("a refused gap START switches the client to the unlock sequence, for this page and the next", async () => {
    // A printer whose roll chip reads as spent: START_PRINT under gap labels is refused with 0x14.
    let labelType = 1;
    const port = new FakePort((p, self) => {
      if (p.type === Cmd.SET_LABEL_TYPE) { labelType = p.data[0]; return encodePacket(responseType(p.type), [1]); }
      if (p.type === Cmd.START_PRINT && labelType === 1) return encodePacket(RESP_REJECTED, [0x14]);
      return defaultReply(p, self);
    });
    const { t, c } = await connect(port);
    await c.printRaster(raster(240), 3, 1);
    expect(port.sent.filter((p) => p.type === Cmd.SET_LABEL_TYPE).map((p) => p.data[0])).toEqual([1, 3, 1]);
    expect(port.sent.filter((p) => p.type === Cmd.IMAGE_ROW)).toHaveLength(240 + NiimbotClient.UNLOCK_TAIL_ROWS);
    expect(c.unlockAll).toBe(true);
    port.sent.length = 0;
    await c.printRaster(raster(240), 3, 1);
    // never tries gap first again
    expect(port.sent.filter((p) => p.type === Cmd.SET_LABEL_TYPE).map((p) => p.data[0])).toEqual([3, 1]);
    expect(port.free).toBe(LINE_BUFFER_ROWS);
    await t.close();
  });

  it("defaults to the unlock sequence for every page", async () => {
    const port = new FakePort();
    const t = new SerialTransport(port);
    await t.open();
    const c = new NiimbotClient(t);
    await c.printRaster(raster(240), 3, 1);
    expect(port.sent.filter((p) => p.type === Cmd.SET_LABEL_TYPE).map((p) => p.data[0])).toEqual([3, 1]);
    expect(port.sent.filter((p) => p.type === Cmd.GET_RFID)).toHaveLength(0);
    await t.close();
  });

  it("reads the roll chip", async () => {
    const hex = "881dbf708e1d10800831313236323131311050433049353231333934303034343430011401150100e6881dbf708e1d1080";
    const data = Uint8Array.from(hex.match(/../g)!.map((h) => parseInt(h, 16)));
    const port = new FakePort((p, self) => (p.type === Cmd.GET_RFID ? encodePacket(responseType(p.type), data) : defaultReply(p, self)));
    const { t, c } = await connect(port);
    expect(await c.readRoll()).toEqual({ barcode: "11262111", serial: "PC0I521394004440", total: 276, used: 277 });
    await t.close();
    const none = new FakePort((p, self) => (p.type === Cmd.GET_RFID ? encodePacket(responseType(p.type), [0]) : defaultReply(p, self)));
    const { t: t2, c: c2 } = await connect(none);
    expect(await c2.readRoll()).toBeNull();
    await t2.close();
  });

  it("surfaces a page rejection (printer still busy) as PrinterRejectedError", async () => {
    const port = new FakePort((p, self) => (p.type === Cmd.START_PAGE_PRINT ? encodePacket(219, []) : defaultReply(p, self)));
    const { t, c } = await connect(port);
    await expect(c.printRaster(raster(10), 3, 1)).rejects.toBeInstanceOf(PrinterRejectedError);
    await t.close();
  });

  it("refuses a raster that is not head-width", async () => {
    const port = new FakePort();
    const { t, c } = await connect(port);
    await expect(c.printRaster({ width: 368, height: 1, rows: [new Uint8Array(46)] })).rejects.toBeInstanceOf(RangeError);
    await t.close();
  });
});

describe("print queue · a busy printer", () => {
  /** Rejects the first START_PAGE_PRINT (what the B21S does while it is
   *  still feeding the previous label), then behaves. */
  function busyOnce() {
    let refused = false;
    return new FakePort((p, port) => {
      if (p.type === Cmd.START_PAGE_PRINT && !refused) {
        refused = true;
        return encodePacket(219, []);
      }
      return defaultReply(p, port);
    });
  }

  it("retries the label instead of losing it", async () => {
    const port = busyOnce();
    const { t, c } = await connect(port);
    const onRetry = vi.fn();
    await printJobWithRetry(c, () => raster(240), { onRetry, wait: async () => {} });
    expect(onRetry).toHaveBeenCalledWith(1, 2);
    // Two attempts, and the second one actually burned the page.
    expect(port.sent.filter((p) => p.type === Cmd.START_PAGE_PRINT)).toHaveLength(2);
    expect(port.sent.filter((p) => p.type === Cmd.IMAGE_ROW)).toHaveLength(240);
    expect(port.sent.filter((p) => p.type === Cmd.END_PRINT)).toHaveLength(1);
    await t.close();
  });

  it("gives up after the retries and says so", async () => {
    const port = new FakePort((p, self) =>
      p.type === Cmd.START_PAGE_PRINT ? encodePacket(219, []) : defaultReply(p, self),
    );
    const { t, c } = await connect(port);
    await expect(
      printJobWithRetry(c, () => raster(240), { wait: async () => {} }),
    ).rejects.toBeInstanceOf(PrinterRejectedError);
    expect(port.sent.filter((p) => p.type === Cmd.START_PAGE_PRINT)).toHaveLength(3); // 1 + 2 retries
    await t.close();
  });

  it("prints a batch of labels back to back", async () => {
    const port = new FakePort();
    const { t, c } = await connect(port);
    for (let i = 0; i < 3; i++) {
      await printJobWithRetry(c, () => raster(240), { wait: async () => {} });
    }
    expect(port.sent.filter((p) => p.type === Cmd.END_PRINT)).toHaveLength(3);
    expect(port.sent.filter((p) => p.type === Cmd.IMAGE_ROW)).toHaveLength(720);
    await t.close();
  });
});
