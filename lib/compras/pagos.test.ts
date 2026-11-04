import { describe, expect, it } from "vitest";
import { PagoCompraSchema, resumenPago, totalCompra } from "./pagos";

describe("totalCompra", () => {
  it("uses the invoice once there is one, else the estimate", () => {
    expect(totalCompra({ factura_total_cop: 80000, total_cop: 75226 })).toBe(80000);
    expect(totalCompra({ factura_total_cop: null, total_cop: 75226 })).toBe(75226);
    expect(totalCompra({ factura_total_cop: null, total_cop: null })).toBeNull();
  });
});

describe("resumenPago", () => {
  it("says what is owed", () => {
    expect(resumenPago(56000, [])).toMatchObject({ estado: "sin_pagos", debe: 56000, texto: "Debe $56.000" });
    expect(resumenPago(56000, [{ monto: 20000, medio: "tarjeta" }])).toMatchObject({ estado: "parcial", debe: 36000, texto: "Pagado $20.000 · Tarjeta · debe $36.000" });
    expect(resumenPago(56000, [{ monto: 20000, medio: "tarjeta" }, { monto: 36000, medio: "pse" }])).toMatchObject({ estado: "pagado", debe: 0, texto: "Pagado $56.000 · Tarjeta + PSE" });
    expect(resumenPago(50000, [{ monto: 56000, medio: "nequi" }]).estado).toBe("de_mas");
    expect(resumenPago(null, [{ monto: 75226, medio: "tarjeta" }]).texto).toBe("Pagado $75.226 · Tarjeta · sin total");
    expect(resumenPago(null, []).estado).toBe("sin_pagos");
  });
});

describe("PagoCompraSchema", () => {
  it("refuses the drawer's cash from the owner", () => {
    const base = { compraId: "3c81e384-39b0-48cc-baf0-b5efee0419b6", fecha: "2026-11-03", monto: 75226 };
    expect(PagoCompraSchema.safeParse({ ...base, medio: "tarjeta" }).success).toBe(true);
    expect(PagoCompraSchema.safeParse({ ...base, medio: "efectivo_caja" }).success).toBe(false);
    expect(PagoCompraSchema.safeParse({ ...base, medio: "tarjeta", monto: 0 }).success).toBe(false);
  });
});
