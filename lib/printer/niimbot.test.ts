import { describe, it, expect } from "vitest";
import {
  Cmd,
  HEAD_WIDTH_BYTES,
  LINE_BUFFER_ROWS,
  decodePackets,
  encodePacket,
  parseInfo,
  parsePrintStatus,
  req,
  responseType,
  rowPacket,
  Info,
} from "@/lib/printer/niimbot";

const hex = (u: Uint8Array) => Array.from(u, (b) => b.toString(16).padStart(2, "0")).join(" ");

describe("encodePacket", () => {
  it("frames as 55 55 type len data xor aa aa", () => {
    // heartbeat request, as captured on the wire
    expect(hex(req.heartbeat())).toBe("55 55 dc 01 01 dc aa aa");
  });
  it("xor covers type, len and every data byte", () => {
    const p = encodePacket(0x13, [0x00, 0xf0, 0x01, 0x80]); // setDimension(240, 384)
    expect(p[p.length - 3]).toBe(0x13 ^ 4 ^ 0x00 ^ 0xf0 ^ 0x01 ^ 0x80);
  });
  it("rejects oversize payloads", () => {
    expect(() => encodePacket(1, new Uint8Array(256))).toThrow(RangeError);
  });
});

describe("decodePackets", () => {
  it("round-trips a frame", () => {
    const { packets, rest } = decodePackets(encodePacket(0xdd, [1, 2, 3]));
    expect(packets).toHaveLength(1);
    expect(packets[0].type).toBe(0xdd);
    expect(Array.from(packets[0].data)).toEqual([1, 2, 3]);
    expect(rest.length).toBe(0);
  });
  it("splits back-to-back frames and keeps an incomplete tail", () => {
    const a = encodePacket(0x02, [1]);
    const b = encodePacket(0xb3, [0, 0, 0x64, 0x64, 0x03, 0x1f, 0, 0]);
    const buf = new Uint8Array([...a, ...b.slice(0, 5)]);
    const { packets, rest } = decodePackets(buf);
    expect(packets.map((p) => p.type)).toEqual([0x02]);
    expect(hex(rest)).toBe(hex(b.slice(0, 5)));
  });
  it("keeps a lone trailing 0x55 as the start of an in-flight frame", () => {
    // Seen on the wire: the B21S reply arrives as `55` then `55 33 01 01 33 aa aa`.
    const first = decodePackets(Uint8Array.from([0x55]));
    expect(first.packets).toHaveLength(0);
    expect(Array.from(first.rest)).toEqual([0x55]);
    const merged = new Uint8Array([...first.rest, 0x55, 0x33, 0x01, 0x01, 0x33, 0xaa, 0xaa]);
    const { packets, rest } = decodePackets(merged);
    expect(packets.map((p) => p.type)).toEqual([0x33]);
    expect(rest.length).toBe(0);
  });
  it("re-frames correctly no matter where a frame is split", () => {
    const frame = encodePacket(0xb3, [0, 0, 100, 100, 3, 0x1f, 0, 0]);
    for (let cut = 1; cut < frame.length; cut++) {
      const a = decodePackets(frame.slice(0, cut));
      expect(a.packets, `cut=${cut}`).toHaveLength(0);
      const merged = new Uint8Array([...a.rest, ...frame.slice(cut)]);
      const b = decodePackets(merged);
      expect(b.packets.map((p) => p.type), `cut=${cut}`).toEqual([0xb3]);
      expect(b.rest.length, `cut=${cut}`).toBe(0);
    }
  });
  it("skips garbage and a frame with a bad checksum", () => {
    const good = encodePacket(0x02, [1]);
    const bad = encodePacket(0x02, [1]);
    bad[bad.length - 3] ^= 0xff;
    const buf = new Uint8Array([0x00, 0xaa, ...bad, 0x55, ...good]);
    const { packets } = decodePackets(buf);
    expect(packets).toHaveLength(1);
    expect(packets[0].type).toBe(0x02);
  });
});

describe("responseType", () => {
  it("defaults to +1", () => {
    expect(responseType(Cmd.START_PRINT)).toBe(0x02);
    expect(responseType(Cmd.END_PRINT)).toBe(0xf4);
  });
  it("uses +16 for the density/type/clear/status family", () => {
    expect(responseType(Cmd.SET_LABEL_DENSITY)).toBe(0x31);
    expect(responseType(Cmd.GET_PRINT_STATUS)).toBe(0xb3);
  });
  it("uses the info key itself for GET_INFO", () => {
    expect(responseType(Cmd.GET_INFO, Info.BATTERY)).toBe(Info.BATTERY);
  });
});

describe("rowPacket", () => {
  it("requires a full 48-byte line — narrower rows print nothing on B21S", () => {
    expect(() => rowPacket(0, new Uint8Array(46))).toThrow(RangeError);
  });
  it("carries row index, black counts per third, repeat=1, then the line", () => {
    const line = new Uint8Array(HEAD_WIDTH_BYTES);
    line[0] = 0xff; // 8 black dots in the first third
    line[20] = 0x0f; // 4 in the second
    line[47] = 0x80; // 1 in the third
    const p = rowPacket(300, line);
    expect(p[2]).toBe(Cmd.IMAGE_ROW);
    const data = p.slice(4, 4 + 6 + HEAD_WIDTH_BYTES);
    expect(Array.from(data.slice(0, 6))).toEqual([0x01, 0x2c, 8, 4, 1, 1]);
    expect(hex(data.slice(6))).toBe(hex(line));
  });
  it("caps a third's count at 255", () => {
    const p = rowPacket(0, new Uint8Array(HEAD_WIDTH_BYTES).fill(0xff));
    expect(p[6]).toBe(128); // 16 bytes × 8 = 128 dots per third, under the cap
  });
});

describe("parsePrintStatus", () => {
  it("reads the B21S 8-byte reply, including free buffer rows", () => {
    // captured: idle printer right after set_dimension
    const st = parsePrintStatus(Uint8Array.from([0, 0, 0x64, 0x64, 0x03, 0x1f, 0, 0]));
    expect(st).toEqual({ page: 0, progress1: 100, progress2: 100, freeRows: LINE_BUFFER_ROWS });
  });
  it("tolerates the B21's 4-byte reply", () => {
    expect(parsePrintStatus(Uint8Array.from([0, 1, 50, 0])).freeRows).toBeNull();
  });
});

describe("parseInfo", () => {
  it("decodes the serial as ASCII", () => {
    const raw = Uint8Array.from([0x47, 0x36, 0x31, 0x38, 0x30, 0x37, 0x30, 0x32, 0x37, 0x30]);
    expect(parseInfo(Info.DEVICESERIAL, raw)).toBe("G618070270");
  });
  it("scales firmware versions by 100", () => {
    expect(parseInfo(Info.SOFTVERSION, Uint8Array.from([0x28, 0x21]))).toBe(102.73);
  });
});
