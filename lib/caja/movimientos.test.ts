import { describe, expect, it } from "vitest";
import { errorMovimiento, motivosDe, parseMonto, porConfirmar, resumenCaja, sugerirCero, teclear } from "./movimientos";

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
    expect(motivosDe("ingreso")).toEqual(["sencillo", "aporte", "devolucion", "otro"]);
    expect(motivosDe("salida")).toEqual(["domicilio", "pago_pedido", "consignacion", "compra_menor", "retiro", "otro"]);
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
  it("requires a justification", () => expect(errorMovimiento({ ...ok, justificacion: "ok" })).toMatch(/obligatorio/));
  it("sencillo by pieces must add up to the amount", () => {
    const denominaciones = [{ valor: 2000, cantidad: 10 }, { valor: 1000, cantidad: 20 }];
    expect(errorMovimiento({ ...ok, monto: 40000, detalle: { denominaciones } })).toBeNull();
    expect(errorMovimiento({ ...ok, monto: 50000, detalle: { denominaciones } })).toMatch(/no coincide/);
  });
  it("a supplier payment needs the invoice photo, unless the order already has it", () => {
    const pago = { tipo: "salida", monto: 120000, motivo: "pago_pedido", justificacion: "Llegó la leche" };
    expect(errorMovimiento(pago)).toMatch(/factura/);
    expect(errorMovimiento({ ...pago, foto: true })).toBeNull();
    expect(errorMovimiento({ ...pago, compraConFactura: true })).toBeNull();
  });
  it("a consignación says who takes it, the receipt can come later", () => {
    const c = { tipo: "salida", monto: 300000, motivo: "consignacion", justificacion: "Consignación del día" };
    expect(errorMovimiento(c)).toMatch(/quién/);
    expect(errorMovimiento({ ...c, detalle: { quien: "Camila" } })).toBeNull();
  });
});

describe("porConfirmar", () => {
  it("flags a consignación without its receipt and a payment without any invoice", () => {
    expect(porConfirmar({ motivo: "consignacion", fotoPath: null })).toMatch(/comprobante/);
    expect(porConfirmar({ motivo: "consignacion", fotoPath: "x.jpg" })).toBeNull();
    expect(porConfirmar({ motivo: "pago_pedido", fotoPath: null })).toMatch(/factura/);
    expect(porConfirmar({ motivo: "pago_pedido", fotoPath: null, compraConFactura: true })).toBeNull();
    expect(porConfirmar({ motivo: "compra_menor", fotoPath: null })).toBeNull();
    expect(porConfirmar({ motivo: "consignacion", fotoPath: null, anulado: true })).toBeNull();
  });
});

describe("sugerirCero", () => {
  it("offers the amount without its last zero when that fits the drawer", () => {
    expect(sugerirCero(1_200_000, 409_000)).toBe(120_000);
    expect(sugerirCero(120_000, 409_000)).toBeNull();
    expect(sugerirCero(9_000_000, 409_000)).toBeNull();
    expect(sugerirCero(1_234_567, 409_000)).toBeNull();
  });
});

describe("teclear", () => {
  it("types digits, 000, backspace and clear", () => {
    expect(teclear("", "0")).toBe("");
    expect(teclear("8", "000")).toBe("8000");
    expect(teclear("8000", "borrar")).toBe("800");
    expect(teclear("8000", "limpiar")).toBe("");
    expect(teclear("123456789", "1")).toBe("123456789");
  });
});

describe("resumenCaja", () => {
  it("adds ingresos and salidas", () => {
    expect(resumenCaja([{ tipo: "ingreso", monto: 100000 }, { tipo: "salida", monto: 35200 }, { tipo: "salida", monto: 4800 }]))
      .toEqual({ ingresos: 100000, salidas: 40000, neto: 60000 });
  });
  it("leaves voided movements out", () => {
    expect(resumenCaja([{ tipo: "salida", monto: 8000, anulado: true }, { tipo: "ingreso", monto: 1000 }])).toEqual({ ingresos: 1000, salidas: 0, neto: 1000 });
  });
});
