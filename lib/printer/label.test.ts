import { describe, expect, it } from "vitest";
import { orderNumber } from "./label";

describe("orderNumber", () => {
  it("strips the series prefix from a folio", () => {
    expect(orderNumber("A-247")).toBe("247");
    expect(orderNumber("A-1")).toBe("1");
    expect(orderNumber(" B-12 ")).toBe("12");
  });
  it("leaves folios without a prefix alone", () => {
    expect(orderNumber("PRUEBA")).toBe("PRUEBA");
    expect(orderNumber("31")).toBe("31");
  });
});
