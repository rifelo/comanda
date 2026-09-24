import { describe, expect, it } from "vitest";
import {
  DENOMINACIONES_COP,
  diferenciaCaja,
  entregaCaja,
  esperadoCaja,
  localToUtc,
  parseCantidad,
  resumenPagos,
  totalContado,
  ventanaTurno,
} from "./arqueo";

describe("parseCantidad", () => {
  it("accepts whole numbers only", () => {
    expect(parseCantidad("12")).toBe(12);
    expect(parseCantidad(" 3 ")).toBe(3);
    expect(parseCantidad("0")).toBe(0);
    expect(parseCantidad("")).toBeNull();
    expect(parseCantidad("1,5")).toBeNull();
    expect(parseCantidad("1.5")).toBeNull();
    expect(parseCantidad("-1")).toBeNull();
  });
});

describe("totals", () => {
  it("sums denominations", () => {
    expect(totalContado([{ valor: 50000, cantidad: 2 }, { valor: 200, cantidad: 3 }, { valor: 100, cantidad: 0 }])).toBe(100600);
    expect(totalContado([])).toBe(0);
  });
  it("lists the Colombian bills and coins, largest first", () => {
    expect(DENOMINACIONES_COP[0]).toBe(100000);
    expect(DENOMINACIONES_COP[DENOMINACIONES_COP.length - 1]).toBe(50);
    expect(DENOMINACIONES_COP).toHaveLength(11);
  });
  it("expected = float + cash sales; difference keeps its sign", () => {
    expect(esperadoCaja(100000, 350000)).toBe(450000);
    expect(diferenciaCaja(440000, 450000)).toBe(-10000);
    expect(diferenciaCaja(452000, 450000)).toBe(2000);
    expect(entregaCaja(452000, 100000)).toBe(352000);
    expect(entregaCaja(80000, 100000)).toBe(-20000);
  });
});

describe("resumenPagos", () => {
  it("splits by method and counts payments", () => {
    const r = resumenPagos([
      { method: "efectivo", amount_cop: 12000 },
      { method: "efectivo", amount_cop: 8000 },
      { method: "tarjeta", amount_cop: 25000 },
      { method: "transferencia", amount_cop: 5000 },
      { method: "otro", amount_cop: 999 },
    ]);
    expect(r).toEqual({ efectivo: 20000, tarjeta: 25000, transferencia: 5000, count: 4 });
  });
});

describe("ventanaTurno", () => {
  it("converts a Bogotá wall-clock time to UTC", () => {
    expect(localToUtc("2026-09-23", "17:00", "America/Bogota").toISOString()).toBe("2026-09-23T22:00:00.000Z");
    expect(localToUtc("2026-09-23", "17:00", "UTC").toISOString()).toBe("2026-09-23T17:00:00.000Z");
  });
  it("falls back to the scheduled start when the turno was never opened", () => {
    const now = new Date("2026-09-23T23:30:00.000Z");
    expect(ventanaTurno({ date: "2026-09-23", inicio: "17:00:00", tz: "America/Bogota", opened_at: null, closed_at: null, now })).toEqual({
      desde: "2026-09-23T22:00:00.000Z",
      hasta: "2026-09-23T23:30:00.000Z",
    });
  });
  it("prefers the real open and close instants", () => {
    const now = new Date("2026-09-24T03:00:00.000Z");
    expect(ventanaTurno({ date: "2026-09-23", inicio: "17:00", tz: "America/Bogota", opened_at: "2026-09-23T22:12:00.000Z", closed_at: "2026-09-24T02:05:00.000Z", now })).toEqual({
      desde: "2026-09-23T22:12:00.000Z",
      hasta: "2026-09-24T02:05:00.000Z",
    });
  });
  it("never inverts the window", () => {
    const now = new Date("2026-09-23T20:00:00.000Z"); // before the 17:00 local start
    const w = ventanaTurno({ date: "2026-09-23", inicio: "17:00", tz: "America/Bogota", opened_at: null, closed_at: null, now });
    expect(w.desde).toBe(w.hasta);
  });
});
