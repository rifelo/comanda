import { describe, expect, it } from "vitest";
import {
  ventanaDesdeUltimo,
  faltaJustificar,
  cobrosDirectos,
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
    // sencillo in, a supplier paid in cash out
    expect(esperadoCaja(100000, 350000, 50000, 35200)).toBe(464800);
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
      { method: "datafono", amount_cop: 25000 },
      { method: "transferencia", amount_cop: 5000 },
      { method: "otro", amount_cop: 999 },
    ]);
    expect(r).toEqual({ efectivo: 20000, datafono: 25000, transferencia: 5000, count: 4 });
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

describe("cobrosDirectos", () => {
  it("turns orders paid with «Cobrar» (no payment rows) into payments", () => {
    const rows = cobrosDirectos([
      { payment_method: "efectivo", total_cop: 12000, pagos: 0 },
      { payment_method: "datafono", total_cop: 9000, pagos: 0 },
      { payment_method: "efectivo", total_cop: 15000, pagos: 2 },
      { payment_method: null, total_cop: 5000, pagos: 0 },
    ]);
    expect(rows).toEqual([{ method: "efectivo", amount_cop: 12000 }, { method: "datafono", amount_cop: 9000 }]);
    expect(resumenPagos(rows)).toEqual({ efectivo: 12000, datafono: 9000, transferencia: 0, count: 2 });
  });
});

describe("faltaJustificar", () => {
  const c = { status: "pendiente", diferencia_cop: 7000, note: null as string | null, pagos_count: 3, esperado_cop: 186400, base_inicial_cop: 179400 };
  it("a difference with no explanation blocks the close", () => {
    expect(faltaJustificar(c)).toBe(true);
    expect(faltaJustificar({ ...c, note: "  " })).toBe(true);
    expect(faltaJustificar({ ...c, diferencia_cop: -500 })).toBe(true);
  });
  it("explained, square, rejected or with nothing to compare: it doesn't", () => {
    expect(faltaJustificar({ ...c, note: "Di mal una vuelta" })).toBe(false);
    expect(faltaJustificar({ ...c, diferencia_cop: 0 })).toBe(false);
    expect(faltaJustificar({ ...c, status: "rechazado" })).toBe(false);
    expect(faltaJustificar({ ...c, pagos_count: 0, esperado_cop: 179400 })).toBe(false);
    // No sales but a movement: still comparable.
    expect(faltaJustificar({ ...c, pagos_count: 0, esperado_cop: 196400 })).toBe(true);
  });
});

describe("ventanaDesdeUltimo", () => {
  const turno = { desde: "2026-11-03T00:07:30.000Z", hasta: "2026-11-03T01:13:55.000Z" };
  it("starts where the last arqueo ended, so a skipped count isn't lost", () => {
    expect(ventanaDesdeUltimo(turno, "2026-11-01T23:06:41.432Z")).toEqual({ desde: "2026-11-01T23:06:41.432Z", hasta: turno.hasta });
    expect(ventanaDesdeUltimo(turno, "2026-11-01 23:06:41.432+00")).toEqual({ desde: "2026-11-01T23:06:41.432Z", hasta: turno.hasta });
  });
  it("keeps the turno's own window with no previous arqueo, or one ending later", () => {
    expect(ventanaDesdeUltimo(turno, null)).toEqual(turno);
    expect(ventanaDesdeUltimo(turno, "2026-11-03T02:00:00.000Z")).toEqual(turno);
  });
});
