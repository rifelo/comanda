import { describe, it, expect, vi } from "vitest";
import {
  Cmd,
  HEAD_WIDTH_BYTES,
  HEAD_WIDTH_PX,
  LINE_BUFFER_ROWS,
  NIIMBOT_USB,
  decodePackets,
  encodePacket,
  responseType,
  type Packet,
} from "@/lib/printer/niimbot";
import {
  NiimbotClient,
  PrinterRejectedError,
  PrinterTimeoutError,
  SerialTransport,
  type SerialPortLike,
} from "@/lib/printer/transport";

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

async function connect(port: FakePort) {
  const t = new SerialTransport(port);
  await t.open();
  return { t, c: new NiimbotClient(t) };
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
