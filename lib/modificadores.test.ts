import { describe, it, expect } from "vitest";
import { summarizeGroup } from "@/lib/modificadores";

describe("summarizeGroup", () => {
  it("counts total and available options", () => {
    const s = summarizeGroup([
      { price_delta_cop: 0, available: true },
      { price_delta_cop: 3500, available: true },
      { price_delta_cop: 4500, available: false },
    ]);
    expect(s.total).toBe(3);
    expect(s.available).toBe(2);
  });

  it("reports the price-delta range", () => {
    const s = summarizeGroup([
      { price_delta_cop: 0, available: true },
      { price_delta_cop: 6500, available: true },
      { price_delta_cop: 2000, available: true },
    ]);
    expect(s.minDelta).toBe(0);
    expect(s.maxDelta).toBe(6500);
  });

  it("handles an empty group", () => {
    expect(summarizeGroup([])).toEqual({ total: 0, available: 0, minDelta: 0, maxDelta: 0 });
  });
});
