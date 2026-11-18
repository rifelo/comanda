import { describe, expect, it } from "vitest";
import { debe, pasoCaja } from "./pasos-caja";

const base = { status: "pendiente" as const, entregadaAt: null, listoAt: null, total: 10000, paid: 0 };

describe("pasoCaja", () => {
  it("new orders are being prepared, paid or not", () => {
    expect(pasoCaja(base)?.columna).toBe(1);
    expect(pasoCaja({ ...base, status: "pagada", paid: 10000 })?.columna).toBe(1);
  });
  it("ready orders wait to be handed over", () => {
    expect(pasoCaja({ ...base, listoAt: "2026-11-18T15:00:00Z" })).toMatchObject({ columna: 2, actual: 1 });
  });
  it("delivered and still owing waits to be charged; paid and delivered leaves", () => {
    expect(pasoCaja({ ...base, listoAt: "x", entregadaAt: "y" })).toMatchObject({ columna: 3, actual: 2 });
    expect(pasoCaja({ ...base, status: "pagada", paid: 10000, entregadaAt: "y" })).toBeNull();
    expect(pasoCaja({ ...base, status: "cancelada" })).toBeNull();
  });
  it("debe counts what is left", () => {
    expect(debe({ status: "pendiente", total: 10000, paid: 4000 })).toBe(6000);
    expect(debe({ status: "pagada", total: 10000, paid: 10000 })).toBe(0);
  });
});
