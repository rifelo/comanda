import { describe, expect, it } from "vitest";
import { normalizarWhatsapp, resumenProveedor, whatsappLegible, type CompraResumible } from "./proveedores";

const c = (p: Partial<CompraResumible>): CompraResumible => ({
  status: "recibido",
  pedido_at: "2026-11-01T15:00:00Z",
  total_cop: null,
  factura_total_cop: null,
  pagos: [],
  ...p,
});

describe("resumenProveedor", () => {
  it("is empty without orders", () => {
    expect(resumenProveedor([], "2026-08-01T00:00:00Z")).toEqual({ pedidos: 0, ultimoPedido: null, enCamino: 0, comprado: 0, debe: 0, sinTotal: 0 });
  });

  it("owes only on received orders, invoice minus payments, never negative", () => {
    const r = resumenProveedor(
      [
        c({ factura_total_cop: 56000, pagos: [{ monto: 20000, medio: "tarjeta" }] }), // debe 36.000
        c({ status: "cerrada", factura_total_cop: 10000, pagos: [{ monto: 15000, medio: "nequi" }] }), // de más → 0
        c({ status: "pedido", total_cop: 99000 }), // on its way: no debt yet
        c({ status: "cancelada", factura_total_cop: 50000 }), // ignored
        c({ status: "recibido" }), // no total → unknown
      ],
      "2026-08-01T00:00:00Z",
    );
    expect(r.debe).toBe(36000);
    expect(r.sinTotal).toBe(1);
    expect(r.enCamino).toBe(1);
    expect(r.pedidos).toBe(4);
    expect(r.comprado).toBe(56000 + 10000 + 99000);
  });

  it("counts «comprado» only inside the window and finds the latest order", () => {
    const r = resumenProveedor(
      [c({ pedido_at: "2026-07-01T10:00:00Z", factura_total_cop: 40000 }), c({ pedido_at: "2026-10-20T10:00:00Z", total_cop: 30000, pagos: [{ monto: 30000, medio: "pse" }] })],
      "2026-08-01T00:00:00Z",
    );
    expect(r.comprado).toBe(30000);
    expect(r.ultimoPedido).toBe("2026-10-20T10:00:00Z");
    expect(r.debe).toBe(40000);
  });
});

describe("whatsapp", () => {
  it("adds 57 to a bare Colombian mobile and keeps other numbers", () => {
    expect(normalizarWhatsapp("300 123 4567")).toBe("573001234567");
    expect(normalizarWhatsapp("+57 300-123-4567")).toBe("573001234567");
    expect(normalizarWhatsapp("6011234567")).toBe("6011234567");
    expect(normalizarWhatsapp("  ")).toBeNull();
  });
  it("prints it readable", () => {
    expect(whatsappLegible("573001234567")).toBe("+57 300 123 4567");
    expect(whatsappLegible("14155550100")).toBe("+14155550100");
    expect(whatsappLegible(null)).toBeNull();
  });
});
