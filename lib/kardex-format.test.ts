import { describe, it, expect } from "vitest";
import { fmtCop, fmtNum } from "@/lib/kardex-format";

describe("fmtNum", () => {
  it("groups thousands and uses a decimal comma", () => {
    expect(fmtNum(10800)).toBe("10.800");
    expect(fmtNum(3.89, 2)).toBe("3,89");
    expect(fmtNum(35960.5)).toBe("35.960,5");
    expect(fmtNum(-180)).toBe("−180");
  });
  it("keeps the zeros of an integer, with or without decimals allowed", () => {
    expect(fmtNum(1080, 0)).toBe("1.080");
    expect(fmtNum(600, 0)).toBe("600");
    expect(fmtNum(60, 2)).toBe("60");
    expect(fmtNum(1500)).toBe("1.500");
    expect(fmtNum(0, 0)).toBe("0");
  });
});

describe("fmtCop", () => {
  it("rounds to pesos and keeps trailing zeros", () => {
    expect(fmtCop(-1080)).toBe("−$1.080");
    expect(fmtCop(480)).toBe("$480");
    expect(fmtCop(42012.4)).toBe("$42.012");
  });
});
