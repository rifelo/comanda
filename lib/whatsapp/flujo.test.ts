import { describe, expect, it } from "vitest";
import { listoParaPreparar, siguienteEstado } from "./flujo";

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
});
