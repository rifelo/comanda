import { describe, expect, it } from "vitest";
import { comisionBold, errorGasto, parseMontoGasto, resumenGastos } from "./gastos";

describe("parseMontoGasto", () => {
  it("reads pesos with thousands dots and comma cents", () => {
    expect(parseMontoGasto("4.345,40")).toBe(4345.4);
    expect(parseMontoGasto("$ 12.000")).toBe(12000);
    expect(parseMontoGasto("1.200.000")).toBe(1200000);
    expect(parseMontoGasto("343,85")).toBe(343.85);
    expect(parseMontoGasto("4345.4")).toBe(4345.4);
    expect(parseMontoGasto("1500")).toBe(1500);
  });
  it("refuses what isn't an amount", () => {
    expect(parseMontoGasto("")).toBeNull();
    expect(parseMontoGasto("abc")).toBeNull();
    expect(parseMontoGasto("-500")).toBeNull();
    expect(parseMontoGasto("12,345")).toBeNull();
  });
});

describe("comisionBold", () => {
  it("matches the Bold statement line by line", () => {
    expect(comisionBold(23000)).toEqual({ comision: 343.85, gmf: 1.38, total: 345.23 });
    expect(comisionBold(7000)).toEqual({ comision: 104.65, gmf: 0.42, total: 105.07 });
    expect(comisionBold(35000).comision).toBe(523.25);
  });
});

describe("errorGasto", () => {
  const ok = { fecha: "2026-10-20", categoria: "comisiones", concepto: "Comisión Bold", monto: 4345.4, cuenta: "bold" };
  it("accepts a complete expense", () => expect(errorGasto(ok)).toBeNull());
  it("requires day, category, concept, amount and account", () => {
    expect(errorGasto({ ...ok, fecha: "" })).toMatch(/día/);
    expect(errorGasto({ ...ok, categoria: null })).toMatch(/categoría/);
    expect(errorGasto({ ...ok, concepto: "x" })).toMatch(/de qué/);
    expect(errorGasto({ ...ok, monto: 0 })).toMatch(/monto/);
    expect(errorGasto({ ...ok, monto: 1.234 })).toMatch(/decimales/);
    expect(errorGasto({ ...ok, cuenta: "cajón" })).toMatch(/cuenta/);
  });
});

describe("resumenGastos", () => {
  it("totals by category, largest first", () => {
    const r = resumenGastos([
      { categoria: "comisiones", monto: 4345.4 },
      { categoria: "servicios", monto: 120000 },
      { categoria: "comisiones", monto: 100.1 },
    ]);
    expect(r.total).toBe(124445.5);
    expect(r.porCategoria).toEqual([
      { categoria: "servicios", monto: 120000, n: 1 },
      { categoria: "comisiones", monto: 4445.5, n: 2 },
    ]);
  });
});
