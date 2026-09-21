import { describe, expect, it } from "vitest";
import { coffeeGramsOf, drinkSpec, planDrinkLabels, planSaleLabels } from "./drink-label";
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

describe("planSaleLabels", () => {
  const byId = { latte: { name: "Latte", printsLabel: true }, torta: { name: "Torta", printsLabel: false }, agua: { name: "Agua", printsLabel: false } };
  const line = (id: string, qty: number, customer?: string): OrderLine => ({ id, name: id, qty, kind: "item", ...(customer ? { customer } : {}) });
  const kinds = (jobs: ReturnType<typeof planSaleLabels>) => jobs.map((j) => (j.kind === "name" ? `name:${j.name}` : j.kind === "drink" ? `drink:${j.item.customer ?? "-"}` : "ig"));

  it("without people: order label, QR, cups", () => {
    expect(kinds(planSaleLabels({ order: [line("latte", 2)], people: [], byId, tableName: "", instagram: true })))
      .toEqual(["name:", "ig", "drink:-", "drink:-"]);
  });
  it("without people and without cups: the order label only, no QR", () => {
    expect(kinds(planSaleLabels({ order: [line("torta", 1), line("agua", 1)], people: [], byId, tableName: "", instagram: true })))
      .toEqual(["name:"]);
  });
  it("with people: name label + QR + cups per person", () => {
    const order = [line("latte", 1, "María"), line("latte", 2, "Juan"), line("torta", 1, "Juan")];
    expect(kinds(planSaleLabels({ order, people: ["Juan", "María"], byId, tableName: "Mesa 3", instagram: true })))
      .toEqual(["name:Juan", "ig", "drink:Juan", "drink:Juan", "name:María", "ig", "drink:María"]);
  });
  it("a person with only food or a bottle gets no labels", () => {
    const order = [line("torta", 1, "Ana"), line("agua", 1, "Ana"), line("latte", 1, "Beto")];
    expect(kinds(planSaleLabels({ order, people: ["Ana", "Beto"], byId, tableName: "", instagram: true })))
      .toEqual(["name:Beto", "ig", "drink:Beto"]);
  });
  it("unassigned cups come last behind the table label with their own QR", () => {
    const order = [line("latte", 1), line("latte", 1, "Ana")];
    expect(kinds(planSaleLabels({ order, people: ["Ana"], byId, tableName: "Mesa 3", instagram: true })))
      .toEqual(["name:Ana", "ig", "drink:Ana", "name:Mesa 3", "ig", "drink:-"]);
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
