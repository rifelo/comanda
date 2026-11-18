import { describe, expect, it } from "vitest";
import { mensajeSegundaRevision, waNumero } from "./aviso";

describe("mensajeSegundaRevision", () => {
  it("lists each item with the count and the link", () => {
    const m = mensajeSegundaRevision({ quien: "Pipe", items: [{ name: "Leche", contado: "3 bolsas", sistema: "6 bolsas" }], link: "https://co-manda.com/inventario/conteos?estado=revisar" });
    expect(m).toContain("1 insumo necesita segunda revisión");
    expect(m).toContain("• Leche: contó 3 bolsas (el sistema decía 6 bolsas)");
    expect(m.endsWith("Revísalo aquí: https://co-manda.com/inventario/conteos?estado=revisar")).toBe(true);
  });
});

describe("waNumero", () => {
  it("adds Colombia's code to a 10-digit mobile", () => {
    expect(waNumero("300 126 9607")).toBe("573001269607");
    expect(waNumero("+57 300 126 9607")).toBe("573001269607");
    expect(waNumero("")).toBeNull();
  });
});
