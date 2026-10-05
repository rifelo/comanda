import { describe, expect, it } from "vitest";
import { conteoSummary, fullCountDue, groupForCount, lineDiff, parseCount, pickCountList } from "./conteo";

const items = [
  { id: "a", name: "Café", unit: "g", category_id: null, conteo_diario: true },
  { id: "b", name: "Leche", unit: "und", category_id: null, conteo_diario: true, archived: true },
  { id: "c", name: "Panela", unit: "und", category_id: null, conteo_diario: false },
];

describe("pickCountList", () => {
  it("daily = flagged and active; full = everything active", () => {
    expect(pickCountList(items, "diario").map((i) => i.id)).toEqual(["a"]);
    expect(pickCountList(items, "completo").map((i) => i.id)).toEqual(["a", "c"]);
  });
});

describe("parseCount", () => {
  it("accepts integers and decimals with dot or comma", () => {
    expect(parseCount("12")).toBe(12);
    expect(parseCount("12,5")).toBe(12.5);
    expect(parseCount(" 3.25 ")).toBe(3.25);
    expect(parseCount("0")).toBe(0);
  });
  it("rejects blanks, negatives and text", () => {
    expect(parseCount("")).toBeNull();
    expect(parseCount("-1")).toBeNull();
    expect(parseCount("doce")).toBeNull();
    expect(parseCount("1.2.3")).toBeNull();
  });
});

describe("lineDiff / conteoSummary", () => {
  it("values the difference at the snapshot cost", () => {
    expect(lineDiff({ expected: 10, counted: 8, unit_cost_cop: 489 })).toEqual({ diff: -2, value: -978 });
    expect(lineDiff({ expected: 2.5, counted: 3, unit_cost_cop: 3250 })).toEqual({ diff: 0.5, value: 1625 });
  });
  it("totals short and over separately", () => {
    const s = conteoSummary([
      { expected: 10, counted: 8, unit_cost_cop: 489 },
      { expected: 5, counted: 5, unit_cost_cop: 100 },
      { expected: 2, counted: 3, unit_cost_cop: 3250 },
    ]);
    expect(s).toEqual({ lines: 3, withDiff: 2, netValue: 2272, shortValue: 978, overValue: 3250 });
  });
});

describe("fullCountDue", () => {
  const now = new Date("2026-09-19T12:00:00Z");
  it("is due when never done or 7+ days ago", () => {
    expect(fullCountDue(null, now)).toEqual({ due: true, days: null });
    expect(fullCountDue("2026-09-12T11:00:00Z", now)).toEqual({ due: true, days: 7 });
    expect(fullCountDue("2026-09-15T11:00:00Z", now)).toEqual({ due: false, days: 4 });
  });
});

describe("groupForCount", () => {
  const cats = [{ id: "c1", label: "Bebidas" }, { id: "c2", label: "Empaques" }];
  const row = (name: string, category_id: string | null, ubicacion: string | null) => ({ name, category_id, ubicacion });
  it("groups by category while no item has a zone", () => {
    const g = groupForCount([row("Leche", "c1", null), row("Vasos", "c2", null), row("Hielo", null, null)], cats, ["Barra", "Nevera"]);
    expect(g.map((x) => x.label)).toEqual(["Bebidas", "Empaques", "Sin categoría"]);
  });
  it("walks zones in the given order, unknown zones after, items with no zone last", () => {
    const g = groupForCount(
      [row("Vasos", "c2", "Bodega"), row("Leche", "c1", "nevera"), row("Café", "c1", "Barra"), row("Jabón", null, "Patio"), row("Hielo", null, null)],
      cats,
      ["Barra", "Nevera", "Bodega"],
    );
    expect(g.map((x) => x.label)).toEqual(["Barra", "nevera", "Bodega", "Patio", "Sin zona"]);
    expect(g[4].items.map((x) => x.name)).toEqual(["Hielo"]);
  });
});
