import { describe, expect, it } from "vitest";
import { diferencias, errorRecepcion, justificacionPago } from "./recepcion";

describe("errorRecepcion", () => {
  const ok = { lineas: [{ recibida: 6 }, { recibida: 0 }], fotoRecibido: "a.jpg", fotoFactura: "b.jpg", facturaTotal: 35200, pago: "efectivo_caja" };
  it("accepts a complete reception (a line may not have come)", () => expect(errorRecepcion(ok)).toBeNull());
  it("every line must be counted", () => expect(errorRecepcion({ ...ok, lineas: [{ recibida: 6 }, { recibida: null }] })).toMatch(/Cuenta/));
  it("nothing arrived is not a reception", () => expect(errorRecepcion({ ...ok, lineas: [{ recibida: 0 }] })).toMatch(/No llegó nada/));
  it("requires both photos", () => {
    expect(errorRecepcion({ ...ok, fotoRecibido: null })).toMatch(/lo que llegó/);
    expect(errorRecepcion({ ...ok, fotoFactura: null })).toMatch(/factura/);
  });
  it("requires the invoice total and the payment", () => {
    expect(errorRecepcion({ ...ok, facturaTotal: 0 })).toMatch(/total/);
    expect(errorRecepcion({ ...ok, pago: null })).toMatch(/pagó/);
  });
});

describe("diferencias", () => {
  it("keeps only the lines that differ", () => {
    expect(diferencias([{ id: "a", pedida: 6, recibida: 6 }, { id: "b", pedida: 12, recibida: 10 }, { id: "c", pedida: 1, recibida: 2 }]))
      .toEqual([{ id: "b", pedida: 12, recibida: 10, diff: -2 }, { id: "c", pedida: 1, recibida: 2, diff: 1 }]);
  });
});

describe("justificacionPago", () => {
  it("names the order and the supplier", () => {
    expect(justificacionPago({ folio: 4, proveedor: "Alimtec SAS" })).toBe("Pago del pedido n.º 4 a Alimtec SAS al recibirlo (factura con foto)");
    expect(justificacionPago({ folio: 4, proveedor: null, nota: "pagó Pipe" })).toMatch(/n\.º 4 al recibirlo .* · pagó Pipe$/);
  });
});
