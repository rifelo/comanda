import { describe, expect, it } from "vitest";
import { errorMovimiento, motivosDe, parseMonto, resumenCaja } from "./movimientos";

describe("parseMonto", () => {
  it("reads pesos the way they are typed", () => {
    expect(parseMonto("50.000")).toBe(50000);
    expect(parseMonto("$ 50,000")).toBe(50000);
    expect(parseMonto("1500")).toBe(1500);
  });
  it("refuses what isn't a whole amount", () => {
    expect(parseMonto("")).toBeNull();
    expect(parseMonto("abc")).toBeNull();
    expect(parseMonto("-500")).toBeNull();
  });
});

describe("motivosDe", () => {
  it("offers income reasons for an ingreso and expense reasons for a salida", () => {
    expect(motivosDe("ingreso")).toEqual(["sencillo", "aporte", "otro"]);
    expect(motivosDe("salida")).toEqual(["compra_menor", "retiro", "otro"]);
    expect(motivosDe("salida", { conPagoPedido: true })).toContain("pago_pedido");
  });
});

describe("errorMovimiento", () => {
  const ok = { tipo: "ingreso", monto: 100000, motivo: "sencillo", justificacion: "Sencillo para abrir: 10 de 10.000" };
  it("accepts a complete movement", () => expect(errorMovimiento(ok)).toBeNull());
  it("requires the direction, the amount and the reason", () => {
    expect(errorMovimiento({ ...ok, tipo: null })).toMatch(/entra o sale/);
    expect(errorMovimiento({ ...ok, monto: 0 })).toMatch(/monto/);
    expect(errorMovimiento({ ...ok, motivo: null })).toMatch(/motivo/);
  });
  it("a reason must match the direction", () => expect(errorMovimiento({ ...ok, motivo: "retiro" })).toMatch(/no corresponde/));
  it("requires a justification", () => expect(errorMovimiento({ ...ok, justificacion: "ok" })).toMatch(/obligatoria/));
});

describe("resumenCaja", () => {
  it("adds ingresos and salidas", () => {
    expect(resumenCaja([{ tipo: "ingreso", monto: 100000 }, { tipo: "salida", monto: 35200 }, { tipo: "salida", monto: 4800 }]))
      .toEqual({ ingresos: 100000, salidas: 40000, neto: 60000 });
  });
});
