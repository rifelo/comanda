import { describe, expect, it } from "vitest";
import { recomendacionesFor, disponibilidadDe } from "./recomendaciones";
import { rankPairs } from "./top-sellers";
import type { PosCatalog, PosMenuItem } from "./types";

const item = (id: string, catId: string, stock: PosMenuItem["stock"] = "ok", script: string | null = null): PosMenuItem => ({
  id, name: id, catId, sub: "", sku: id, price: 1000, gluten: true, fav: false, stock, mods: [], desc: "",
  printsLabel: false, spec: [], image: null, recipe: [], prep: [], script,
});

function catalog(menu: PosMenuItem[], pairs: PosCatalog["pairs"] = {}): PosCatalog {
  return {
    cats: [], menu, top: [], combos: [
      { id: "c1", name: "Jugo + pastel", items: ["jugo", "pastel"], price: 13000, desc: "", saving: 1000 },
      { id: "c2", name: "Torta + tinto", items: ["torta", "tinto"], price: 9000, desc: "", saving: 500 },
    ],
    modGroups: {}, byId: Object.fromEntries(menu.map((m) => [m.id, m])), comboById: {},
    catLabel: { jugos: "Jugos", sal: "Salados" }, orgName: "x", instagram: null, sticker: null, cupArt: null, handArt: null,
    equipo: [], pairs, pago: { transferenciaLlave: null, transferenciaTitular: null, datafonoLiquidacion: null }, recibo: { encabezado: null, pie: null },
  };
}

describe("rankPairs", () => {
  it("counts products on the same orders, as a share of the product's orders", () => {
    const names = new Map([["a", "A"], ["b", "B"], ["c", "C"]]);
    const lines = [];
    for (let i = 0; i < 10; i++) lines.push({ productoId: "a", qty: 1, at: "", ordenId: `o${i}` });
    for (let i = 0; i < 4; i++) lines.push({ productoId: "b", qty: 1, at: "", ordenId: `o${i}` });
    for (let i = 0; i < 2; i++) lines.push({ productoId: "c", qty: 1, at: "", ordenId: `o${i}` });
    const r = rankPairs(lines, names);
    expect(r.a).toEqual([{ id: "b", pct: 40 }]); // c only twice: below the minimum
    expect(r.b[0]).toEqual({ id: "a", pct: 100 });
  });
});

describe("recomendacionesFor", () => {
  it("joins script, pairings, combos and low stock, skipping what is sold out", () => {
    const menu = [item("jugo", "jugos", "ok", "¿Te lo hago en leche?"), item("pastel", "sal"), item("agotado", "sal", "sin"), item("torta", "sal", "bajo"), item("tinto", "sal")];
    const r = recomendacionesFor(catalog(menu, { jugo: [{ id: "agotado", pct: 50 }, { id: "pastel", pct: 30 }] }), "jugo");
    expect(r.script).toBe("¿Te lo hago en leche?");
    expect(r.pairings.map((p) => p.item.id)).toEqual(["pastel"]);
    expect(r.combos.map((c) => c.id)).toEqual(["c1"]);
    expect(r.lowStock.map((m) => m.id)).toEqual(["torta"]);
    expect(r.conversionPct).toBeNull();
  });
});

describe("disponibilidadDe", () => {
  it("lists what's left and what ran out in the category", () => {
    const menu = [item("mora", "jugos"), item("mango", "jugos"), item("uva", "jugos", "sin")];
    expect(disponibilidadDe(catalog(menu), "mora")).toEqual({ label: "Jugos", hay: ["mora", "mango"], agotados: ["uva"] });
  });
});
