import { describe, expect, it } from "vitest";
import { bogotaDay, bogotaTime, dayLabel, linesPayload, normalizePerson, rebuildLines, rebuildPeople, sanitizeMods, shiftDay, timeAgo } from "./pending";
import type { PendingOrder, PosCatalog, PosMenuItem } from "./types";

const latte: PosMenuItem = {
  id: "p-latte", name: "Latte", catId: "c", sub: "", sku: "BC-007", price: 7500,
  gluten: false, fav: false, stock: "ok", mods: ["g-size", "g-extras"], desc: "", printsLabel: true, spec: ["1 SHOT · 9 G"], image: null, recipe: [], prep: [],
};
const tinto: PosMenuItem = { ...latte, id: "p-tinto", name: "Tinto", price: 3000, mods: [] };
const catalog: PosCatalog = {
  cats: [], menu: [latte, tinto], combos: [{ id: "cb-1", name: "Desayuno", items: ["p-tinto"], price: 9000, desc: "", saving: 500 }],
  modGroups: {
    "g-size": { id: "g-size", name: "Tamaño", type: "single", required: true, options: [{ name: "Mediano", delta: 0 }, { name: "Grande", delta: 1500 }] },
    "g-extras": { id: "g-extras", name: "Extras", type: "multi", required: false, options: [{ name: "Canela", delta: 0 }, { name: "Shot extra", delta: 2000 }] },
  },
  byId: { "p-latte": latte, "p-tinto": tinto },
  comboById: { "cb-1": { id: "cb-1", name: "Desayuno", items: ["p-tinto"], price: 9000, desc: "", saving: 500 } },
  catLabel: {}, orgName: "Cafe", instagram: null, sticker: null, cupArt: null,
};

const order = (items: PendingOrder["items"]): PendingOrder => ({
  id: "o1", folio: "A-3", status: "pendiente", orderType: "aqui", total: 0, sinGluten: false, note: "", customerName: "", customerNames: [], createdAt: "2026-09-14T10:00:00Z", paidAt: null, paymentMethod: null, tendered: null, change: 0, paid: 0, pagos: [], items, mergedInto: null, mergedIntoFolio: null,
});

describe("sanitizeMods", () => {
  it("keeps valid stored selections", () => {
    expect(sanitizeMods({ "g-size": "Grande", "g-extras": ["Canela"] }, latte, catalog))
      .toEqual({ "g-size": "Grande", "g-extras": ["Canela"] });
  });
  it("drops vanished options and falls back on required singles", () => {
    expect(sanitizeMods({ "g-size": "Enorme", "g-extras": ["Canela", "Nada"], "g-old": "x" }, latte, catalog))
      .toEqual({ "g-size": "Mediano", "g-extras": ["Canela"] });
  });
  it("tolerates garbage", () => {
    expect(sanitizeMods(null, latte, catalog)).toEqual({ "g-size": "Mediano", "g-extras": [] });
    expect(sanitizeMods("nope", tinto, catalog)).toEqual({});
  });
});

describe("rebuildLines", () => {
  it("rebuilds live lines from the catalog, sorted by position", () => {
    const { lines, missing } = rebuildLines(order([
      { id: "i2", kind: "item", productoId: "p-tinto", comboId: null, name: "Tinto viejo", qty: 1, unitPrice: 2500, mods: {}, position: 1, customer: "" },
      { id: "i1", kind: "item", productoId: "p-latte", comboId: null, name: "Latte", qty: 2, unitPrice: 9000, mods: { "g-size": "Grande" }, position: 0, customer: "" },
    ]), catalog);
    expect(missing).toBe(0);
    expect(lines.map((l) => l.name)).toEqual(["Latte", "Tinto"]);
    expect(lines[0]).toMatchObject({ id: "p-latte", qty: 2, basePrice: 7500, hasMods: true, mods: { "g-size": "Grande", "g-extras": [] } });
    expect(lines[1]).toMatchObject({ id: "p-tinto", basePrice: 3000, hasMods: false });
  });
  it("carries the person on live, combo and snapshot lines", () => {
    const { lines } = rebuildLines(order([
      { id: "i1", kind: "item", productoId: "p-latte", comboId: null, name: "Latte", qty: 1, unitPrice: 7500, mods: {}, position: 0, customer: "Juan" },
      { id: "i2", kind: "combo", productoId: null, comboId: "cb-1", name: "Desayuno", qty: 1, unitPrice: 9000, mods: {}, position: 1, customer: "María" },
      { id: "i3", kind: "item", productoId: "p-gone", comboId: null, name: "Mocca", qty: 1, unitPrice: 8500, mods: {}, position: 2, customer: "Pedro" },
      { id: "i4", kind: "item", productoId: "p-tinto", comboId: null, name: "Tinto", qty: 1, unitPrice: 3000, mods: {}, position: 3, customer: "" },
    ]), catalog);
    expect(lines.map((l) => l.customer)).toEqual(["Juan", "María", "Pedro", undefined]);
    expect(lines[2].missing).toBe(true);
  });
  it("keeps snapshot lines for missing products and combos", () => {
    const { lines, missing } = rebuildLines(order([
      { id: "i1", kind: "item", productoId: "p-gone", comboId: null, name: "Mocca", qty: 1, unitPrice: 8500, mods: { x: "y" }, position: 0, customer: "" },
      { id: "i2", kind: "combo", productoId: null, comboId: "cb-gone", name: "Combo viejo", qty: 1, unitPrice: 12000, mods: {}, position: 1, customer: "" },
      { id: "i3", kind: "combo", productoId: null, comboId: "cb-1", name: "Desayuno", qty: 1, unitPrice: 9000, mods: {}, position: 2, customer: "" },
    ]), catalog);
    expect(missing).toBe(2);
    expect(lines[0]).toMatchObject({ id: "p-gone", name: "Mocca", basePrice: 8500, missing: true, mods: {} });
    expect(lines[1]).toMatchObject({ id: "cb-gone", kind: "combo", price: 12000, missing: true });
    expect(lines[2]).toMatchObject({ id: "cb-1", kind: "combo", price: 9000, items: ["p-tinto"] });
    expect(lines[2].missing).toBeUndefined();
  });
});

describe("timeAgo", () => {
  const t0 = Date.parse("2026-09-14T12:00:00Z");
  it("formats minutes and hours", () => {
    expect(timeAgo("2026-09-14T11:59:30Z", t0)).toBe("ahora");
    expect(timeAgo("2026-09-14T11:55:00Z", t0)).toBe("hace 5 min");
    expect(timeAgo("2026-09-14T11:00:00Z", t0)).toBe("hace 1 h");
    expect(timeAgo("2026-09-14T10:50:00Z", t0)).toBe("hace 1 h 10 min");
    expect(timeAgo("2026-09-14T12:05:00Z", t0)).toBe("ahora");
  });
});

describe("linesPayload", () => {
  it("sends ids, qty and mods only", () => {
    expect(linesPayload([{ id: "a", name: "A", qty: 2, kind: "item", basePrice: 1 }, { id: "c", name: "C", qty: 1, kind: "combo", price: 5, mods: { g: "x" } }]))
      .toEqual([{ kind: "item", id: "a", qty: 2, mods: {} }, { kind: "combo", id: "c", qty: 1, mods: { g: "x" } }]);
  });
  it("adds the person only when the line has one", () => {
    expect(linesPayload([{ id: "a", name: "A", qty: 1, kind: "item", customer: "Juan" }, { id: "b", name: "B", qty: 1, kind: "item", customer: "" }]))
      .toEqual([{ kind: "item", id: "a", qty: 1, mods: {}, customer: "Juan" }, { kind: "item", id: "b", qty: 1, mods: {} }]);
  });
});

describe("rebuildPeople", () => {
  const item = (customer: string, position: number): PendingOrder["items"][number] =>
    ({ id: `i${position}`, kind: "item", productoId: "p-tinto", comboId: null, name: "Tinto", qty: 1, unitPrice: 3000, mods: {}, position, customer });
  it("keeps the header roster order and appends names found only on lines", () => {
    expect(rebuildPeople({ customerNames: ["María", "Juan"], items: [item("Pedro", 1), item("Juan", 0)] }))
      .toEqual(["María", "Juan", "Pedro"]);
  });
  it("orders line-only names by position and dedupes case-insensitively", () => {
    expect(rebuildPeople({ customerNames: [], items: [item("ana", 2), item("Ana", 0), item("", 1)] }))
      .toEqual(["Ana"]);
  });
  it("tolerates a missing roster and whitespace", () => {
    expect(rebuildPeople({ customerNames: undefined as unknown as string[], items: [item("  Luis   Ríos ", 0)] }))
      .toEqual(["Luis Ríos"]);
    expect(normalizePerson("  a  b ")).toBe("a b");
  });
});

describe("Bogotá days", () => {
  it("rolls the calendar day at 05:00 UTC", () => {
    expect(bogotaDay(Date.parse("2026-09-16T04:59:00Z"))).toBe("2026-09-15");
    expect(bogotaDay(Date.parse("2026-09-16T05:00:00Z"))).toBe("2026-09-16");
  });
  it("shifts days across month ends", () => {
    expect(shiftDay("2026-09-30", 1)).toBe("2026-10-01");
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("labels today, yesterday and older days", () => {
    expect(dayLabel("2026-09-16", "2026-09-16")).toBe("Hoy · mié 16 sep");
    expect(dayLabel("2026-09-15", "2026-09-16")).toBe("Ayer · mar 15 sep");
    expect(dayLabel("2026-09-11", "2026-09-16")).toBe("vie 11 sep");
  });
  it("formats Bogotá clock time", () => {
    expect(bogotaTime("2026-09-16T19:05:00Z")).toBe("14:05");
  });
});
