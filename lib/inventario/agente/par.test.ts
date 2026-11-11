import { describe, expect, it } from "vitest";
import { calcularPar, esMasivo, loteHabitual } from "./par";

describe("calcularPar", () => {
  it("the cups example: 30/day, 15 days delivery, bulk lot of 5.000", () => {
    const base = { consumoDiario: 30, entregaDias: 15, diasSeguridad: null, lote: 5000, pack: 1000 };
    const ok = calcularPar({ ...base, stock: 800 });
    expect(ok.masivo).toBe(true);
    expect(ok.seguridadDias).toBe(10);
    expect(ok.puntoReorden).toBe(750);
    expect(ok.pedir).toBe(false);
    const bajo = calcularPar({ ...base, stock: 740 });
    expect(bajo.pedir).toBe(true);
    expect(bajo.cantidadSugerida).toBe(5000);
  });

  it("a daily item: 3 safety days, suggestion up to a week more, in whole packs", () => {
    const leche = calcularPar({ consumoDiario: 3600, entregaDias: 1, diasSeguridad: null, lote: 5400, pack: 5400, stock: 9000 });
    expect(leche.masivo).toBe(false);
    expect(leche.puntoReorden).toBe(14400); // 3600 × (1 + 3)
    expect(leche.pedir).toBe(true);
    expect(leche.cantidadSugerida! % 5400).toBe(0);
    expect(leche.cantidadSugerida! + 9000).toBeGreaterThanOrEqual(14400 + 3600 * 7);
  });

  it("owner's safety days and no supplier", () => {
    const r = calcularPar({ consumoDiario: 10, entregaDias: null, diasSeguridad: 5, lote: null, pack: null, stock: 100 });
    expect(r.entregaDias).toBe(1);
    expect(r.puntoReorden).toBe(60);
    expect(r.coberturaDias).toBe(10);
    expect(r.pedir).toBe(false);
  });

  it("nothing consumed: no PAR, nothing to ask", () => {
    const r = calcularPar({ consumoDiario: 0, entregaDias: 2, diasSeguridad: null, lote: 100, pack: null, stock: -3 });
    expect(r.pedir).toBe(false);
    expect(r.coberturaDias).toBeNull();
  });
});

it("esMasivo / loteHabitual", () => {
  expect(esMasivo(30, 5000)).toBe(true);
  expect(esMasivo(23, 500)).toBe(false);
  expect(loteHabitual([500, 5000, 5000])).toBe(5000);
  expect(loteHabitual([2, 4])).toBe(3);
  expect(loteHabitual([])).toBeNull();
});
