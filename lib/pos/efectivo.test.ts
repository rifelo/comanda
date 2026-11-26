import { describe, expect, it } from "vitest";
import { sugerenciasEfectivo } from "./efectivo";

describe("sugerenciasEfectivo", () => {
  it("offers the next round amounts above the total", () => {
    expect(sugerenciasEfectivo(26_000)).toEqual([30_000, 40_000]);
    expect(sugerenciasEfectivo(9_500)).toEqual([10_000, 20_000]);
    expect(sugerenciasEfectivo(7_000, 3)).toEqual([8_000, 10_000, 20_000]);
  });
  it("never repeats the exact total", () => {
    expect(sugerenciasEfectivo(20_000)).toEqual([50_000, 100_000]);
    expect(sugerenciasEfectivo(100_000)).not.toContain(100_000);
  });
  it("has nothing to offer for an empty ticket", () => {
    expect(sugerenciasEfectivo(0)).toEqual([]);
  });
});
