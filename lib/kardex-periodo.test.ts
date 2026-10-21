import { describe, it, expect } from "vitest";
import { parsePeriodo, diaCorto } from "@/lib/kardex-periodo";

describe("parsePeriodo", () => {
  it("defaults to the last 30 days ending today", () => {
    const p = parsePeriodo({}, "2026-10-21");
    expect(p).toMatchObject({ desde: "2026-09-22", hasta: "2026-10-21", dias: 30 });
    expect(p.desdeIso).toBe("2026-09-22T00:00:00-05:00");
    expect(p.hastaIso).toBe("2026-10-22T00:00:00-05:00");
  });
  it("honours a preset", () => {
    expect(parsePeriodo({ dias: "7" }, "2026-10-21")).toMatchObject({ desde: "2026-10-15", dias: 7 });
    expect(parsePeriodo({ dias: "90" }, "2026-10-21")).toMatchObject({ desde: "2026-07-24", dias: 90 });
    expect(parsePeriodo({ dias: "12" }, "2026-10-21").dias).toBe(30);
  });
  it("prefers explicit dates when valid and ordered", () => {
    const p = parsePeriodo({ dias: "7", desde: "2026-10-01", hasta: "2026-10-05" }, "2026-10-21");
    expect(p).toMatchObject({ desde: "2026-10-01", hasta: "2026-10-05", dias: null });
    expect(p.hastaIso).toBe("2026-10-06T00:00:00-05:00");
  });
  it("falls back to the preset on bad or inverted dates", () => {
    expect(parsePeriodo({ desde: "2026-10-09", hasta: "2026-10-01" }, "2026-10-21").dias).toBe(30);
    expect(parsePeriodo({ desde: "ayer", hasta: "2026-10-01" }, "2026-10-21").dias).toBe(30);
  });
  it("crosses month and year boundaries", () => {
    expect(parsePeriodo({ dias: "7" }, "2026-01-03").desde).toBe("2025-12-28");
  });
});

describe("diaCorto", () => {
  it("formats without Intl", () => {
    expect(diaCorto("2026-10-21")).toBe("21 oct");
    expect(diaCorto("2026-01-03", true)).toBe("3 ene 2026");
  });
});
