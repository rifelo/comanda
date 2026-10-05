import { describe, it, expect } from "vitest";
import { nivelDe, aEntrada, deEntrada, cantidadLegible, enPaquetes, dePaquetes, guiaNivel, sugerido, validarNiveles, nombrePaquete, piezaDe } from "./niveles";

// Leche: se cuenta por bolsa de 900 ml y se compra por paca de 12 (10.800 ml).
const leche = { unit: "ml", stock_critico: 900, stock_min: 1800, stock_objetivo: 10800, pack_qty: 10800, pieza_qty: 900, pack_label: "bolsa" };
const azucar = { unit: "g", stock_critico: 0, stock_min: 500, stock_objetivo: null, pack_qty: null, pack_label: null };

describe("nivelDe", () => {
  it("is red at or under the critical level, and always when nothing is left", () => {
    expect(nivelDe(900, 900, 1800)).toBe("rojo");
    expect(nivelDe(0, 0, 0)).toBe("rojo");
    expect(nivelDe(-40, 0, 500)).toBe("rojo");
  });
  it("is amber at or under the reorder point and green above it", () => {
    expect(nivelDe(1800, 900, 1800)).toBe("amarillo");
    expect(nivelDe(1801, 900, 1800)).toBe("verde");
  });
  it("treats a level of 0 as not set", () => {
    expect(nivelDe(1, 0, 0)).toBe("verde");
    expect(nivelDe(300, 0, 500)).toBe("amarillo");
  });
});

describe("packs", () => {
  it("converts levels to and from what is typed", () => {
    expect(aEntrada(1800, leche)).toBe(2);
    expect(deEntrada(2.5, leche)).toBe(2250);
    expect(aEntrada(500, azucar)).toBe(500);
    expect(deEntrada(500, azucar)).toBe(500);
  });
  it("counts in the piece the owner set, in the pack for pieces bought by pack, else in the unit", () => {
    expect(piezaDe(leche)).toBe(900);
    expect(piezaDe({ unit: "und", pack_qty: 50, pieza_qty: null })).toBe(50); // vasos: paquetes cerrados + sueltos
    expect(piezaDe({ unit: "g", pack_qty: 2500, pieza_qty: null })).toBeNull(); // café sin pieza: en gramos
    expect(piezaDe({ unit: "und", pack_qty: null, pieza_qty: null })).toBeNull();
  });
  it("keeps things counted by the piece in units, even when bought by pack", () => {
    const agua = { unit: "und", pack_qty: 12, pack_label: "paca" };
    expect(aEntrada(3, agua)).toBe(3);
    expect(deEntrada(3, agua)).toBe(3);
    expect(cantidadLegible(3, agua)).toBe("3 und");
    expect(sugerido(2, { stock_min: 3, stock_objetivo: 24, pack_qty: 12 })).toEqual({ qty: 24, packs: 2 });
  });
  it("names quantities the way they are said", () => {
    expect(cantidadLegible(1800, leche)).toBe("2 bolsas");
    expect(cantidadLegible(900, leche)).toBe("1 bolsa");
    expect(cantidadLegible(450, leche)).toBe("½ bolsa");
    expect(cantidadLegible(500, azucar)).toBe("500 g");
    expect(nombrePaquete({ pack_label: null }, 2)).toBe("paq.");
    expect(nombrePaquete({ pack_label: "Paquete" }, 3)).toBe("paquetes");
  });
  it("splits a count into whole packs and loose units, and back", () => {
    expect(enPaquetes(2100, 900)).toEqual({ packs: 2, sueltos: 300 });
    expect(enPaquetes(2100, null)).toEqual({ packs: 0, sueltos: 2100 });
    expect(dePaquetes(2, 300, 900)).toBe(2100);
    expect(dePaquetes(0, 40, null)).toBe(40);
  });
});

describe("guiaNivel", () => {
  it("spells out both thresholds in packs", () => {
    expect(guiaNivel(leche)).toBe("Poco: 2 bolsas o menos · Se acabó: 1 bolsa o menos");
    expect(guiaNivel(azucar)).toBe("Poco: 500 g o menos");
    expect(guiaNivel({ ...azucar, stock_min: 0 })).toBeNull();
  });
});

describe("sugerido", () => {
  it("orders nothing while above the reorder point", () => {
    expect(sugerido(5000, leche)).toEqual({ qty: 0, packs: 0 });
  });
  it("orders up to the target in whole packs", () => {
    expect(sugerido(1800, leche)).toEqual({ qty: 10800, packs: 1 }); // 9.000 ml hacen falta → 1 paca
    expect(sugerido(1800, { ...leche, stock_objetivo: 21600 })).toEqual({ qty: 21600, packs: 2 });
  });
  it("ignores a negative stock (never recorded purchases) instead of over-ordering", () => {
    expect(sugerido(-12000, leche)).toEqual({ qty: 10800, packs: 1 });
  });
  it("falls back to twice the reorder point when there is no target", () => {
    expect(sugerido(200, azucar)).toEqual({ qty: 800, packs: null });
  });
  it("suggests nothing for an item with no levels", () => {
    expect(sugerido(0, { stock_min: 0, stock_objetivo: null, pack_qty: null })).toEqual({ qty: 0, packs: null });
  });
});

describe("validarNiveles", () => {
  it("accepts ordered or unset levels", () => {
    expect(validarNiveles(900, 1800, 10800)).toBeNull();
    expect(validarNiveles(0, 0, null)).toBeNull();
    expect(validarNiveles(0, 500, null)).toBeNull();
  });
  it("rejects levels out of order", () => {
    expect(validarNiveles(1800, 1800, null)).toMatch(/Se acabó/);
    expect(validarNiveles(0, 1800, 1800)).toMatch(/Pedir hasta/);
    expect(validarNiveles(900, 0, 500)).toMatch(/Pedir hasta/);
  });
});
