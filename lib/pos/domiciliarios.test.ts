import { describe, expect, it } from "vitest";
import { enlaceWhatsapp, leerDomiciliarios, lineasSinNumero, mensajeDomiciliario } from "./domiciliarios";

describe("leerDomiciliarios", () => {
  it("reads one courier per line and adds Colombia's code", () => {
    expect(leerDomiciliarios("Danny 314 469 5514\nJuan: +57 300 111 2233")).toEqual([
      { nombre: "Danny", numero: "573144695514" },
      { nombre: "Juan", numero: "573001112233" },
    ]);
  });
  it("keeps hours with the name and takes the last phone number", () => {
    expect(leerDomiciliarios("Danny (9 a. m.–10 p. m.) 314 469 5514")).toEqual([{ nombre: "Danny (9 a. m.–10 p. m.)", numero: "573144695514" }]);
  });
  it("skips lines without a number and flags them", () => {
    expect(leerDomiciliarios("Danny\n\n3144695514")).toEqual([{ nombre: "Domiciliario", numero: "573144695514" }]);
    expect(lineasSinNumero("Danny\nJuan 3001112233")).toEqual(["Danny"]);
    expect(leerDomiciliarios(null)).toEqual([]);
  });
});

describe("mensajeDomiciliario", () => {
  const p = { folio: "A-1950", cliente: "Karl", telefono: "573123779085", direccion: "Carrera 14 #33 B-04", items: [{ qty: 1, name: "Milo frío" }], total: 7000, pagado: true };
  it("has what the courier needs", () => {
    const m = mensajeDomiciliario({ nombre: "Danny", numero: "573144695514" }, p);
    expect(m).toContain("Hola Danny");
    expect(m).toContain("Recibe: Karl · Tel 573123779085");
    expect(m).toContain("Dirección: Carrera 14 #33 B-04");
    expect(m).toContain("Productos: 1 × Milo frío");
    expect(m).toContain("ya pagó $7.000 por transferencia");
    expect(m).toContain("El domicilio te lo pagamos desde PA'YO por transferencia");
    expect(mensajeDomiciliario({ nombre: "Danny (9 a. m.–10 p. m.)", numero: "1" }, p)).toContain("Hola Danny,");
    expect(mensajeDomiciliario({ nombre: "Danny", numero: "1" }, { ...p, pagado: false })).toContain("Cobrar al entregar: $7.000");
  });
  it("builds the wa.me link", () => {
    expect(enlaceWhatsapp("573144695514", "Hola 🛵")).toBe("https://wa.me/573144695514?text=Hola%20%F0%9F%9B%B5");
  });
});
