import { describe, expect, it } from "vitest";
import { coffeeGramsOf, drinkSpec, planDrinkLabels } from "./drink-label";
import type { OrderLine } from "./types";

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

describe("planDrinkLabels", () => {
  const byId = {
    latte: { name: "Latte", spec: ["1 SHOT · 9 G"], desc: "suave", printsLabel: true },
    tinto: { name: "Tinto", spec: ["TRADICIONAL"], printsLabel: true },
    torta: { name: "Torta", printsLabel: false },
  };
  const line = (id: string, qty: number, customer?: string, kind: "item" | "combo" = "item"): OrderLine =>
    ({ id, name: id, qty, kind, ...(customer ? { customer } : {}) });

  it("groups by person in roster order, unassigned last, ticket order inside", () => {
    const order = [line("tinto", 1), line("latte", 1, "María"), line("latte", 1, "Juan"), line("tinto", 1, "María")];
    expect(planDrinkLabels(order, ["Juan", "María"], byId).map((l) => `${l.customer ?? "-"}:${l.name}`))
      .toEqual(["Juan:Latte", "María:Latte", "María:Tinto", "-:Tinto"]);
  });
  it("prints one label per cup and skips food and combos", () => {
    const order = [line("latte", 2, "Juan"), line("torta", 3, "Juan"), line("cb", 1, "Juan", "combo")];
    const plan = planDrinkLabels(order, ["Juan"], byId);
    expect(plan.map((l) => l.name)).toEqual(["Latte", "Latte"]);
    expect(plan[0]).toMatchObject({ productId: "latte", spec: ["1 SHOT · 9 G"], desc: "suave", customer: "Juan" });
  });
  it("leaves the customer out of unassigned labels", () => {
    expect(planDrinkLabels([line("latte", 1)], [], byId)[0]).not.toHaveProperty("customer");
  });
  it("still prints for a name that is on a line but not on the roster", () => {
    const order = [line("latte", 1, "Zoe"), line("latte", 1, "Ana")];
    expect(planDrinkLabels(order, ["Ana"], byId).map((l) => l.customer)).toEqual(["Ana", "Zoe"]);
  });
  it("caps per line and overall", () => {
    expect(planDrinkLabels([line("latte", 40, "Juan")], ["Juan"], byId).length).toBe(12);
    expect(planDrinkLabels([line("latte", 12, "Juan"), line("tinto", 12, "Juan"), line("latte", 12)], ["Juan"], byId).length).toBe(24);
    expect(planDrinkLabels([line("latte", 40)], [], byId, { perLine: 3, total: 2 }).length).toBe(2);
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
