import { describe, it, expect } from "vitest";
import { effectivePrice, priceDeltaPct } from "@/lib/precios";

describe("effectivePrice", () => {
  it("uses the override when present", () => {
    expect(effectivePrice(24900, 28900)).toBe(28900);
  });
  it("falls back to base when there is no override", () => {
    expect(effectivePrice(24900, null)).toBe(24900);
  });
  it("treats a 0 override as a real price, not a fallback", () => {
    expect(effectivePrice(24900, 0)).toBe(0);
  });
});

describe("priceDeltaPct", () => {
  it("is positive when the list is dearer than base", () => {
    expect(priceDeltaPct(24900, 28900)).toBe(16); // +16.06% → 16
  });
  it("is negative when the list is cheaper (happy hour)", () => {
    expect(priceDeltaPct(24900, 19900)).toBe(-20); // -20.08% → -20
  });
  it("is 0 at base price", () => {
    expect(priceDeltaPct(24900, 24900)).toBe(0);
  });
  it("is 0 when base is 0 (avoids divide-by-zero)", () => {
    expect(priceDeltaPct(0, 5000)).toBe(0);
  });
});
