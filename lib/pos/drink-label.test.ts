import { describe, expect, it } from "vitest";
import { coffeeGramsOf, drinkSpec } from "./drink-label";

const latte = [
  { name: "Cafe Okana", unit: "g", qty: 18 },
  { name: "Bolsa de leche la gran vida sixpack", unit: "und", qty: 0.244 },
  { name: "vaso darnel pet x 12Oz", unit: "und", qty: 1 },
];

describe("coffeeGramsOf", () => {
  it("adds up only ingredients measured in grams whose name is coffee", () => {
    expect(coffeeGramsOf(latte)).toBe(18);
    expect(coffeeGramsOf([{ name: "Café Devoción", unit: "g", qty: 9 }, { name: "Cafe Okana", unit: "g", qty: 9 }])).toBe(18);
  });
  it("ignores coffee sold by the unit and everything that isn't coffee", () => {
    expect(coffeeGramsOf([{ name: "Bebida de Café Frío Juan Valdez", unit: "und", qty: 1 }])).toBe(0);
    expect(coffeeGramsOf([{ name: "Hielo Andina", unit: "kg", qty: 0.15 }])).toBe(0);
    expect(coffeeGramsOf([])).toBe(0);
  });
});

describe("drinkSpec", () => {
  it("counts shots of 9 g", () => {
    expect(drinkSpec({ coffeeG: 9 })).toEqual(["1 SHOT · 9 G"]);
    expect(drinkSpec({ coffeeG: 18 })).toEqual(["2 SHOTS · 18 G"]);
    expect(drinkSpec({ coffeeG: 27 })).toEqual(["3 SHOTS · 27 G"]);
  });
  it("calls the tinto traditional whatever its recipe says", () => {
    expect(drinkSpec({ coffeeG: 8, categoryLabel: "Tinto" })).toEqual(["TRADICIONAL"]);
  });
  it("says SIN CAFÉ when there is none", () => {
    expect(drinkSpec({ coffeeG: 0, categoryLabel: "Sin café" })).toEqual(["SIN CAFÉ"]);
  });
  it("never shows zero shots for a trace of coffee", () => {
    expect(drinkSpec({ coffeeG: 3 })).toEqual(["1 SHOT · 3 G"]);
  });
});
