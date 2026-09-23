import { describe, it, expect } from "vitest";
import {
  lineTotal,
  unitCostFromPack,
  recipeCost,
  margenOf,
  stockLevel,
  isAlerting,
} from "@/lib/cost";

describe("lineTotal", () => {
  it("multiplies qty by unit cost and rounds", () => {
    expect(lineTotal(2, 18900)).toBe(37800);
    expect(lineTotal(0.15, 18900)).toBe(2835);
    expect(lineTotal(0.04, 4200)).toBe(168);
  });
  it("rounds half values", () => {
    expect(lineTotal(1, 0.5)).toBe(1); // 0.5 → 1
    expect(lineTotal(3, 0.5)).toBe(2); // 1.5 → 2 (banker-free Math.round)
  });
  it("is zero for zero qty or cost", () => {
    expect(lineTotal(0, 999)).toBe(0);
    expect(lineTotal(999, 0)).toBe(0);
  });
});

describe("unitCostFromPack", () => {
  it("divides pack cost by pack quantity, keeping 2 decimals", () => {
    expect(unitCostFromPack(4400, 12)).toBe(366.67); // vasos 12oz
    expect(unitCostFromPack(3250, 900)).toBe(3.61); // bolsa de leche, per ml
    expect(unitCostFromPack(10200, 50)).toBe(204); // tapa domo Darnel x50
    expect(unitCostFromPack(18000, 24)).toBe(750);
  });
  it("is zero when the pack quantity is not positive (no divide-by-zero)", () => {
    expect(unitCostFromPack(4400, 0)).toBe(0);
    expect(unitCostFromPack(4400, -3)).toBe(0);
  });
  it("is zero for a free pack", () => {
    expect(unitCostFromPack(0, 12)).toBe(0);
  });
});

describe("recipeCost", () => {
  it("sums line totals", () => {
    expect(
      recipeCost([
        { qty: 2, cost_cop: 18900 }, // 37800
        { qty: 1, cost_cop: 1100 }, //  1100
        { qty: 0.5, cost_cop: 3200 }, // 1600
      ]),
    ).toBe(40500);
  });
  it("is zero for an empty recipe", () => {
    expect(recipeCost([])).toBe(0);
  });
});

describe("margenOf", () => {
  it("computes gross margin percent", () => {
    expect(margenOf(24900, 7503)).toBe(70); // (24900-7503)/24900 ≈ 69.86 → 70
    expect(margenOf(1000, 600)).toBe(40);
  });
  it("returns 0 when price is 0 (matches the generated column)", () => {
    expect(margenOf(0, 500)).toBe(0);
  });
  it("goes negative when cost exceeds price", () => {
    expect(margenOf(1200, 37800)).toBe(-3050);
  });
});

describe("stockLevel", () => {
  it("flags out-of-stock at or below zero", () => {
    expect(stockLevel(0, 5)).toBe("sin");
    expect(stockLevel(-2, 5)).toBe("sin");
  });
  it("flags low at or below the minimum", () => {
    expect(stockLevel(5, 5)).toBe("bajo");
    expect(stockLevel(3, 5)).toBe("bajo");
  });
  it("is ok above the minimum", () => {
    expect(stockLevel(6, 5)).toBe("ok");
  });
  it("never warns low when the threshold is 0", () => {
    expect(stockLevel(1, 0)).toBe("ok");
    expect(stockLevel(0, 0)).toBe("sin");
  });
});

describe("isAlerting", () => {
  it("alerts on low and out, not ok", () => {
    expect(isAlerting("sin")).toBe(true);
    expect(isAlerting("bajo")).toBe(true);
    expect(isAlerting("ok")).toBe(false);
  });
});
