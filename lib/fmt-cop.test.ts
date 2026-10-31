import { describe, expect, it } from "vitest";
import { fmtCOP } from "./utils";

describe("fmtCOP", () => {
  it("groups thousands with dots like es-CO, without ICU", () => {
    expect(fmtCOP(0)).toBe("0");
    expect(fmtCOP(950)).toBe("950");
    expect(fmtCOP(12500)).toBe("12.500");
    expect(fmtCOP(1234567)).toBe("1.234.567");
    expect(fmtCOP(-4000)).toBe("-4.000");
  });

  it("keeps up to three decimals with a comma", () => {
    expect(fmtCOP(1234.5)).toBe("1.234,5");
    expect(fmtCOP(5.28)).toBe("5,28");
    expect(fmtCOP(1.23456)).toBe("1,235");
  });
});
