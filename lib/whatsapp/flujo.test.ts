import { describe, expect, it } from "vitest";
import { listoParaPreparar, pasoWa, siguienteEstado, tipoWa } from "./flujo";

describe("siguienteEstado", () => {
  it("delivery waits for the payment, pick-up goes straight to preparation", () => {
    expect(siguienteEstado("por_aceptar", "domicilio", "aceptar")).toBe("esperando_pago");
    expect(siguienteEstado("por_aceptar", "llevar", "aceptar")).toBe("en_preparacion");
  });
  it("the admin's approval starts the preparation", () => {
    expect(siguienteEstado("esperando_pago", "domicilio", "aprobar_pago")).toBe("en_preparacion");
    expect(siguienteEstado("por_aceptar", "domicilio", "aprobar_pago")).toBeNull();
  });
  it("only a delivery being prepared can leave with the courier", () => {
    expect(siguienteEstado("en_preparacion", "domicilio", "salio")).toBe("en_camino");
    expect(siguienteEstado("en_preparacion", "llevar", "salio")).toBeNull();
    expect(siguienteEstado("esperando_pago", "domicilio", "salio")).toBeNull();
  });
  it("can't repeat a step", () => {
    expect(siguienteEstado("en_preparacion", "llevar", "aceptar")).toBeNull();
    expect(siguienteEstado("rechazado", "domicilio", "aprobar_pago")).toBeNull();
  });
  it("prints only when it enters preparation", () => {
    expect(listoParaPreparar("en_preparacion")).toBe(true);
    expect(listoParaPreparar("esperando_pago")).toBe(false);
  });
  it("ready: pick-up waits for the customer, delivery for the courier, a nearby point just goes", () => {
    expect(siguienteEstado("en_preparacion", "recoge", "listo")).toBe("listo");
    expect(siguienteEstado("en_preparacion", "domicilio", "listo")).toBe("listo");
    expect(siguienteEstado("en_preparacion", "cercano", "listo")).toBeNull();
    expect(siguienteEstado("en_preparacion", "cercano", "salio")).toBe("en_camino");
    expect(siguienteEstado("listo", "domicilio", "salio")).toBe("en_camino");
    expect(siguienteEstado("listo", "recoge", "salio")).toBeNull();
    expect(siguienteEstado("esperando_pago", "domicilio", "listo")).toBeNull();
  });
});

describe("tipoWa", () => {
  it("a llevar order with a nearby point is walked over", () => {
    expect(tipoWa({ orderType: "domicilio" })).toBe("domicilio");
    expect(tipoWa({ orderType: "llevar", seLoLlevamos: true, direccion: "La droguería BARCO" })).toBe("cercano");
    expect(tipoWa({ orderType: "llevar", seLoLlevamos: false, direccion: null })).toBe("recoge");
  });
});

describe("pasoWa", () => {
  const dom = { orderType: "domicilio", direccion: "Calle 19" };
  it("puts each state in its board column and step", () => {
    expect(pasoWa({ ...dom, waEstado: "por_aceptar" })).toMatchObject({ columna: 1, actual: 0 });
    expect(pasoWa({ ...dom, waEstado: "esperando_pago" })).toMatchObject({ columna: 2, actual: 1 });
    expect(pasoWa({ ...dom, waEstado: "en_preparacion" })).toMatchObject({ columna: 3, actual: 2 });
    expect(pasoWa({ ...dom, waEstado: "listo" })).toMatchObject({ columna: 4, actual: 3 });
    expect(pasoWa({ ...dom, waEstado: "en_camino" })).toMatchObject({ columna: 4, actual: 4 });
    expect(pasoWa({ orderType: "llevar", waEstado: "en_preparacion" })).toMatchObject({ tipo: "recoge", columna: 3, actual: 1 });
    expect(pasoWa({ orderType: "llevar", waEstado: "listo" })).toMatchObject({ columna: 4, actual: 2 });
    expect(pasoWa({ orderType: "llevar", seLoLlevamos: true, direccion: "Portería", waEstado: "en_camino" })).toMatchObject({ tipo: "cercano", columna: 4, actual: 2 });
  });
  it("leaves out turned-down and non-WhatsApp orders", () => {
    expect(pasoWa({ ...dom, waEstado: "rechazado" })).toBeNull();
    expect(pasoWa({ ...dom, waEstado: null })).toBeNull();
  });
});
