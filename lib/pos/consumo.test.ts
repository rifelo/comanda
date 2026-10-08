import { describe, expect, it } from "vitest";
import { asApplied, consumptionDeltas, explodeConsumption, modPairsOf } from "./consumo";

const recipes = new Map([
  ["latte", [{ ingredienteId: "cafe", qty: 9 }, { ingredienteId: "leche", qty: 0.244 }, { ingredienteId: "vaso", qty: 1 }]],
  ["tinto", [{ ingredienteId: "cafe", qty: 8 }, { ingredienteId: "vaso", qty: 1 }]],
  ["torta", [{ ingredienteId: "torta-naranja", qty: 1 }]],
]);
const combos = new Map([["desayuno", [{ productoId: "tinto", qty: 1 }, { productoId: "torta", qty: 2 }]]]);

describe("explodeConsumption", () => {
  it("multiplies recipe lines by the quantity sold and sums across lines", () => {
    const out = explodeConsumption(
      [
        { kind: "item", productoId: "latte", comboId: null, qty: 2 },
        { kind: "item", productoId: "tinto", comboId: null, qty: 1 },
      ],
      recipes, combos,
    );
    expect(Object.fromEntries(out)).toEqual({ cafe: 26, leche: 0.488, vaso: 3 });
  });
  it("expands combos to their products", () => {
    const out = explodeConsumption([{ kind: "combo", productoId: null, comboId: "desayuno", qty: 2 }], recipes, combos);
    expect(Object.fromEntries(out)).toEqual({ cafe: 16, vaso: 2, "torta-naranja": 4 });
  });
  it("ignores products without a recipe and unknown combos", () => {
    const out = explodeConsumption(
      [
        { kind: "item", productoId: "milo", comboId: null, qty: 3 },
        { kind: "combo", productoId: null, comboId: "nope", qty: 1 },
      ],
      recipes, combos,
    );
    expect(out.size).toBe(0);
  });
});

describe("consumptionDeltas", () => {
  it("takes everything on a fresh order", () => {
    const desired = asApplied(new Map([["cafe", 9], ["vaso", 1]]));
    expect(Object.fromEntries(consumptionDeltas(new Map(), desired))).toEqual({ cafe: -9, vaso: -1 });
  });
  it("applies only the difference after an edit", () => {
    const applied = new Map([["cafe", -9], ["vaso", -1]]);
    const desired = asApplied(new Map([["cafe", 18], ["vaso", 1], ["leche", 0.2]]));
    expect(Object.fromEntries(consumptionDeltas(applied, desired))).toEqual({ cafe: -9, leche: -0.2 });
  });
  it("gives everything back on cancel and is a no-op when already in sync", () => {
    const applied = new Map([["cafe", -9], ["vaso", -1]]);
    expect(Object.fromEntries(consumptionDeltas(applied, new Map()))).toEqual({ cafe: 9, vaso: 1 });
    expect(consumptionDeltas(applied, new Map(applied)).size).toBe(0);
  });
});

describe("modifier options with ingredients", () => {
  it("adds what the chosen option takes, per unit sold", () => {
    const recipes = new Map([["jugo", [{ ingredienteId: "pulpa", qty: 125 }]]]);
    const options = new Map([["leche", [{ ingredienteId: "leche", qty: 200 }]], ["agua", [{ ingredienteId: "agua", qty: 210 }]]]);
    const out = explodeConsumption(
      [
        { kind: "item", productoId: "jugo", comboId: null, qty: 2, optionIds: ["leche"] },
        { kind: "item", productoId: "jugo", comboId: null, qty: 1, optionIds: ["agua", "sin-receta"] },
      ],
      recipes, new Map(), options,
    );
    expect(Object.fromEntries(out)).toEqual({ pulpa: 375, leche: 400, agua: 210 });
  });
  it("reads the chosen options out of the mods json", () => {
    expect(modPairsOf({ g1: "a", g2: ["b", "c"], g3: "", g4: null })).toEqual([{ groupId: "g1", name: "a" }, { groupId: "g2", name: "b" }, { groupId: "g2", name: "c" }]);
    expect(modPairsOf(null)).toEqual([]);
  });
});
