import { describe, expect, it } from "vitest";
import { costoPorUnidad, costoTanda, errorPreparacion, fmtTandas } from "./preparaciones";

// Crema chantilly (PP-03): 250 ml whip + 125 ml leche + 10 ml vainilla + 1 cápsula → 385 g
const chantilly = [
  { qty: 250, costo: 22 },
  { qty: 125, costo: 3.89 },
  { qty: 10, costo: 77.33 },
  { qty: 1, costo: 6190 },
];

describe("preparaciones", () => {
  it("costs a batch and a unit", () => {
    expect(costoTanda(chantilly)).toBe(12949.55);
    expect(costoPorUnidad(chantilly, 385)).toBe(33.64);
    expect(costoPorUnidad(chantilly, 0)).toBe(0);
  });

  it("validates", () => {
    const base = { id: "p", rinde: 385, preparaciones: new Set<string>(["q"]) };
    expect(errorPreparacion({ ...base, lineas: [{ ingredienteId: "a", qty: 1 }] })).toBeNull();
    expect(errorPreparacion({ ...base, rinde: 0, lineas: [{ ingredienteId: "a", qty: 1 }] })).toMatch(/tanda/);
    expect(errorPreparacion({ ...base, lineas: [] })).toMatch(/al menos/);
    expect(errorPreparacion({ ...base, lineas: [{ ingredienteId: "p", qty: 1 }] })).toMatch(/sí misma/);
    expect(errorPreparacion({ ...base, lineas: [{ ingredienteId: "q", qty: 1 }] })).toMatch(/otra preparación/);
    expect(errorPreparacion({ ...base, lineas: [{ ingredienteId: "a", qty: 1 }, { ingredienteId: "a", qty: 2 }] })).toMatch(/repetido/);
    expect(errorPreparacion({ ...base, lineas: [{ ingredienteId: "a", qty: 0 }] })).toMatch(/mayor que 0/);
  });

  it("formats batches", () => {
    expect(fmtTandas(1)).toBe("1");
    expect(fmtTandas(1.5)).toBe("1,5");
  });
});
