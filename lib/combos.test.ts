import { describe, it, expect } from "vitest";
import { comboRegularTotal, comboSaving, comboSavingPct } from "@/lib/combos";

const items = [
  { qty: 1, price_cop: 24900 },
  { qty: 1, price_cop: 8900 },
  { qty: 1, price_cop: 5900 },
];

describe("comboRegularTotal", () => {
  it("sums qty × price across items", () => {
    expect(comboRegularTotal(items)).toBe(39700);
    expect(comboRegularTotal([{ qty: 3, price_cop: 1000 }])).toBe(3000);
  });
  it("is zero for an empty combo", () => {
    expect(comboRegularTotal([])).toBe(0);
  });
});

describe("comboSaving", () => {
  it("is the difference between regular and combo price", () => {
    expect(comboSaving(39700, 33900)).toBe(5800);
  });
  it("never goes negative when the combo costs more than the parts", () => {
    expect(comboSaving(10000, 12000)).toBe(0);
  });
});

describe("comboSavingPct", () => {
  it("computes the saving as a percent of regular", () => {
    expect(comboSavingPct(39700, 33900)).toBe(15); // 5800/39700 ≈ 14.6 → 15
  });
  it("is 0 when regular total is 0", () => {
    expect(comboSavingPct(0, 0)).toBe(0);
  });
});
