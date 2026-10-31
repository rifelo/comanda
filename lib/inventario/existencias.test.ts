import { describe, it, expect } from "vitest";
import { filaInsumo, filtrarInsumos, lineasParaDuplicar, opcionesReceta, ordenarFilas, stockDeReceta, zonasConConteo, type InsumoLista } from "./existencias";

const it_ = (p: Partial<InsumoLista> & { id: string; name: string }): InsumoLista => ({
  unit: "und",
  stock_current: 10,
  stock_min: 0,
  stock_critico: 0,
  cost_cop: 100,
  pack_qty: null,
  pack_label: null,
  pieza_qty: null,
  ubicacion: null,
  category_id: null,
  ...p,
});

describe("filaInsumo", () => {
  it("reads the stock the way it is said and flags negatives", () => {
    const leche = filaInsumo(it_({ id: "l", name: "Leche", unit: "ml", stock_current: 2700, pack_label: "bolsa", pieza_qty: 900, ubicacion: "Nevera" }));
    expect(leche).toMatchObject({ zona: "Nevera", stock: "3 bolsas", negativo: false, nivel: "verde" });
    const cafe = filaInsumo(it_({ id: "c", name: "Café", unit: "g", stock_current: -568 }));
    expect(cafe).toMatchObject({ zona: "Otros", stock: "−568 g", negativo: true, nivel: "rojo" });
    expect(filaInsumo(it_({ id: "v", name: "Vasos", stock_current: 5, stock_min: 10 })).nivel).toBe("amarillo");
  });
});

describe("filtrarInsumos / zonasConConteo / ordenarFilas", () => {
  const filas = [
    filaInsumo(it_({ id: "1", name: "Leche entera", ubicacion: "Nevera", category_id: "lac" })),
    filaInsumo(it_({ id: "2", name: "Azúcar", ubicacion: "Barra" })),
    filaInsumo(it_({ id: "3", name: "Café Okana", ubicacion: "barra", stock_current: -3 })),
    filaInsumo(it_({ id: "4", name: "Jabón", ubicacion: "Aseo", stock_current: 0 })),
  ];
  it("searches ignoring accents and the zone, also by category", () => {
    expect(filtrarInsumos(filas, { q: "azucar", zona: "Nevera" }).map((f) => f.item.id)).toEqual(["2"]);
    expect(filtrarInsumos(filas, { q: "lácteos", zona: "todas", categoria: (id) => (id === "lac" ? "Lácteos" : "") }).map((f) => f.item.id)).toEqual(["1"]);
  });
  it("filters by zone without a search", () => {
    expect(filtrarInsumos(filas, { q: "", zona: "Barra" }).map((f) => f.item.id)).toEqual(["2", "3"]);
    expect(filtrarInsumos(filas, { q: " ", zona: "todas" })).toHaveLength(4);
  });
  it("lists zones in the walked order with counts", () => {
    expect(zonasConConteo(filas)).toEqual([
      { zona: "Barra", n: 2 },
      { zona: "Nevera", n: 1 },
      { zona: "Aseo", n: 1 },
    ]);
  });
  it("puts negatives and empty items first", () => {
    expect(ordenarFilas(filas).map((f) => f.item.id)).toEqual(["3", "4", "2", "1"]);
  });
});

describe("stockDeReceta", () => {
  it("is null without lines", () => {
    expect(stockDeReceta([])).toEqual({ estado: null, falta: null });
  });
  it("reports the worst ingredient", () => {
    expect(stockDeReceta([{ name: "Café", stock: 500, min: 100 }])).toEqual({ estado: "ok", falta: null });
    expect(stockDeReceta([{ name: "Café", stock: 50, min: 100 }, { name: "Vaso", stock: 30, min: 10 }])).toEqual({ estado: "bajo", falta: "Café" });
    expect(stockDeReceta([{ name: "Café", stock: 50, min: 100 }, { name: "Leche", stock: -200, min: 900 }])).toEqual({ estado: "sin", falta: "Leche" });
  });
});

describe("opcionesReceta", () => {
  const opts = [
    { id: "a", name: "Azúcar" },
    { id: "b", name: "Leche entera" },
    { id: "c", name: "Café Okana" },
    { id: "d", name: "Leche condensada" },
    { id: "e", name: "Vaso 12 oz" },
  ];
  const usos = new Map([
    ["e", 20],
    ["b", 12],
    ["a", 3],
  ]);
  it("without a search: recent first, then most used, skipping the recipe's", () => {
    const r = opcionesReceta(opts, { q: "", excluir: new Set(["b"]), recientes: ["d", "b"], usos });
    expect(r.map((o) => o.id)).toEqual(["d", "e", "a"]);
  });
  it("with a search: matches, starts-with first", () => {
    const r = opcionesReceta(opts, { q: "lech", excluir: new Set(), recientes: [], usos });
    expect(r.map((o) => o.id)).toEqual(["d", "b"]);
    expect(opcionesReceta(opts, { q: "okana", excluir: new Set(), recientes: [], usos }).map((o) => o.id)).toEqual(["c"]);
  });
});

describe("lineasParaDuplicar", () => {
  it("copies only what the recipe doesn't have yet", () => {
    const origen = [
      { ingrediente_id: "cafe", qty: 18 },
      { ingrediente_id: "leche", qty: 230 },
      { ingrediente_id: "cafe", qty: 9 },
    ];
    expect(lineasParaDuplicar(origen, new Set(["leche"]))).toEqual([{ ingrediente_id: "cafe", qty: 18 }]);
  });
});
