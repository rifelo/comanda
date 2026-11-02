import { describe, expect, it } from "vitest";
import { fechaCorta, hora12, paso, renderComandaBarraHtml, renderPrecuentaHtml } from "./tirillas";

const marca = { nombre: "Café Pa'Yo", logo: "/labels/payo-icono.svg", encabezado: "Yopal, Casanare · @cafepayo · cafepayo.com" };

describe("tirillas · formato", () => {
  it("fecha y hora como en el canvas, en hora de Bogotá", () => {
    expect(fechaCorta("2026-11-01T21:32:00Z")).toBe("01 nov 2026");
    expect(hora12("2026-11-01T21:32:00Z")).toBe("4:32 p. m.");
    expect(hora12("2026-11-01T05:05:00Z")).toBe("12:05 a. m.");
    expect(hora12("2026-11-01T17:00:00Z")).toBe("12:00 p. m.");
  });

  it("un paso se parte en título en negrita y detalle", () => {
    expect(paso("Espresso doble · 18 g → 36 g en 25–30 s")).toEqual({ titulo: "Espresso doble", detalle: "18 g → 36 g en 25–30 s" });
    expect(paso("Leche entera: 120 ml vaporizada a 60–65 °C")).toEqual({ titulo: "Leche entera", detalle: "120 ml vaporizada a 60–65 °C" });
    expect(paso("Calentar la taza")).toEqual({ titulo: "Calentar la taza" });
  });
});

describe("renderPrecuentaHtml (JSON del spec)", () => {
  const data = {
    marca, cliente: "Franchesco", mesa: "4", pedido: "#128", fecha: "01 nov 2026", hora: "4:32 p. m.",
    items: [
      { cantidad: 1, nombre: "Latte frío de arándanos", detalle: ["Leche de avena"], unitario: 12000, total: 12000 },
      { cantidad: 2, nombre: "Cappuccino", unitario: 7000, total: 14000 },
      { cantidad: 1, nombre: "Rollo de canela", total: 10000 },
      { cantidad: 1, nombre: "Torta de zanahoria", total: 7000 },
    ],
    subtotal: 43000, total: 43000,
  };
  it("pinta el artboard: marca, Pa' nombre, mesa, ítems, subtotal, total y cierre", () => {
    const html = renderPrecuentaHtml(data);
    for (const t of ["Café Pa&#39;Yo", "Yopal, Casanare", ">Franchesco<", "Mesa 4", "Pedido #128", "01 nov 2026", "4:32 p. m.",
      "Leche de avena", "2 × $7.000", "$14.000", "5 productos", "Subtotal $43.000", "$43.000", "Tómalo con calma.",
      "Precuenta · no es factura de venta", "/labels/mano-taza-asa.svg", "Dela Gothic One", "Nority Display", "Delight"]) {
      expect(html).toContain(t);
    }
  });
  it("sin mesa ni nombre: no inventa el bloque", () => {
    const html = renderPrecuentaHtml({ ...data, mesa: undefined, cliente: undefined });
    expect(html).not.toContain("Mesa");
    expect(html).not.toContain("Pa&#39;<");
  });
});

describe("renderComandaBarraHtml (JSON del spec)", () => {
  it("número grande, opciones en negro y las proporciones de cada bebida; lo demás sin receta", () => {
    const html = renderComandaBarraHtml({
      marca, pedido: "#128", hora: "4:32 p. m.", cliente: "Franchesco", barista: "Andrés",
      bebidas: [{ nombre: "Latte frío de arándanos", cantidad: 1, modificadores: ["Leche de avena"],
        proporciones: [{ cantidad: "100 g", nombre: "Hielo" }, { cantidad: "18 g", nombre: "Café Okana", nota: "Espresso doble" }],
        envase: "vaso darnel pet x 12Oz · Tapa domo Darnel 12 oz", pasos: [] }],
      otros: [{ nombre: "Rollo de canela", cantidad: 1, modificadores: [] }],
    });
    for (const t of ["#128", "Pa' Franchesco", "Prepara: <span class=\"b\">Andrés", "1×</span>", "chip inv big\">Leche de avena<",
      ">100 g</td>", ">18 g</td>", "Café Okana<span", "· Espresso doble", "Tapa domo Darnel 12 oz", "También en el pedido",
      "1× Rollo de canela", "Uso interno · no entregar al cliente"]) {
      expect(html).toContain(t);
    }
    expect(html).not.toContain("mano-taza");
  });

  it("sin ingredientes en la receta: pasos numerados", () => {
    const html = renderComandaBarraHtml({ marca, pedido: "#1", hora: "", bebidas: [{ nombre: "Tinto", cantidad: 1, modificadores: [], pasos: [{ titulo: "Servir" }] }] });
    expect(html).toContain("1. Servir");
  });
});
