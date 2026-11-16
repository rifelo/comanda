import { describe, expect, it } from "vitest";
import { modoComanda } from "./tickets";

describe("comanda automática", () => {
  it("a device set to «No» still sends its comandas to the caja", () => {
    expect(modoComanda({ modo: "no", recibo: "pedir", comanda: true, papel: "80" })).toBe("caja");
  });
  it("keeps where the printer is on the other devices", () => {
    expect(modoComanda({ modo: "aqui", recibo: "pedir", comanda: true, papel: "80" })).toBe("aqui");
    expect(modoComanda({ modo: "caja", recibo: "auto", comanda: true, papel: "80" })).toBe("caja");
  });
});
