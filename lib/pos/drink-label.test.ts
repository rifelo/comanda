import { describe, expect, it } from "vitest";
import { coffeeGramsOf, drinkSpec, energiaLine, LABELS_PER_DRINK, planDrinkLabels, planSaleLabels } from "./drink-label";
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
  const byId = { latte: { name: "Latte", printsLabel: true }, tinto: { name: "Tinto", printsLabel: true }, torta: { name: "Torta", printsLabel: false }, agua: { name: "Agua", printsLabel: false } };
  const line = (id: string, qty: number, customer?: string): OrderLine => ({ id, name: id, qty, kind: "item", ...(customer ? { customer } : {}) });
  const kinds = (jobs: ReturnType<typeof planSaleLabels>) =>
    jobs.map((j) => (j.kind === "cliente" ? `pa:${j.name || "ti"}${j.cup ? "" : "!"}` : `vaso:${j.item.name}/${j.customer || "-"}@${j.line}${j.resto ? "+" : ""}`));
  const pair = (name: string, drink: string, qr: string) => [`pa:${name || "ti"}`, `vaso:${drink}/${qr}`];

  it("one drink without a name: «Pa' ti» and the drink with its QR", () => {
    expect(kinds(planSaleLabels({ order: [line("latte", 1)], people: [], byId, tableName: "" })))
      .toEqual(pair("", "Latte", "-@0+"));
  });
  it("one named drink: its name, then the drink", () => {
    expect(kinds(planSaleLabels({ order: [line("latte", 1)], people: [], byId, tableName: "Juan" })))
      .toEqual(pair("Juan", "Latte", "-@0+"));
  });
  it("every drink of the order gets the same two labels", () => {
    const jobs = planSaleLabels({ order: [line("latte", 2), line("torta", 1), line("tinto", 1)], people: [], byId, tableName: "Juan" });
    expect(kinds(jobs)).toEqual([...pair("Juan", "Latte", "-@0+"), ...pair("Juan", "Latte", "-@0"), ...pair("Juan", "Tinto", "-@2")]);
    expect(jobs.length).toBe(3 * LABELS_PER_DRINK);
  });
  it("a blank name counts as no name", () => {
    expect(kinds(planSaleLabels({ order: [line("latte", 1)], people: [], byId, tableName: "   " })))
      .toEqual(pair("", "Latte", "-@0+"));
  });
  it("without cups and without a name: nothing prints", () => {
    expect(kinds(planSaleLabels({ order: [line("torta", 1), line("agua", 1)], people: [], byId, tableName: "" }))).toEqual([]);
  });
  it("without cups but with a name: the name label only", () => {
    expect(kinds(planSaleLabels({ order: [line("torta", 1)], people: [], byId, tableName: "Juan" }))).toEqual(["pa:Juan!"]);
  });
  it("with people: each cup's pair under its person, roster order", () => {
    const order = [line("latte", 1, "María"), line("latte", 2, "Juan"), line("torta", 1, "Juan")];
    expect(kinds(planSaleLabels({ order, people: ["Juan", "María"], byId, tableName: "Mesa 3" })))
      .toEqual([...pair("Juan", "Latte", "Juan@1+"), ...pair("Juan", "Latte", "Juan@1"), ...pair("María", "Latte", "María@0+")]);
  });
  it("a person with only food or a bottle gets no labels", () => {
    const order = [line("torta", 1, "Ana"), line("agua", 1, "Ana"), line("latte", 1, "Beto")];
    expect(kinds(planSaleLabels({ order, people: ["Ana", "Beto"], byId, tableName: "" })))
      .toEqual(pair("Beto", "Latte", "Beto@2+"));
  });
  it("unassigned cups come last behind the table label", () => {
    const order = [line("latte", 1), line("latte", 1, "Ana")];
    expect(kinds(planSaleLabels({ order, people: ["Ana"], byId, tableName: "Mesa 3" })))
      .toEqual([...pair("Ana", "Latte", "Ana@1+"), ...pair("Mesa 3", "Latte", "-@0+")]);
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

describe("energiaLine", () => {
  it("draws a number from 1 to 10", () => {
    expect(energiaLine(0)).toBe("+1 DE ENERGÍA");
    expect(energiaLine(0.099)).toBe("+1 DE ENERGÍA");
    expect(energiaLine(0.1)).toBe("+2 DE ENERGÍA");
    expect(energiaLine(0.65)).toBe("+7 DE ENERGÍA");
    expect(energiaLine(0.999999)).toBe("+10 DE ENERGÍA");
    expect(energiaLine(1)).toBe("+10 DE ENERGÍA");
  });
});
