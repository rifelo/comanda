import { describe, expect, it } from "vitest";
import { estadoDe, leerCodigo, lineasDe, normalizarInstagram, nuevoCodigo, puntosDe, tuPedido, urlCalificacion } from "./calificaciones";

describe("codes", () => {
  it("ten characters, none that read alike", () => {
    for (let i = 0; i < 50; i++) expect(nuevoCodigo()).toMatch(/^[2-9A-HJKMNP-Z]{10}$/);
    expect(nuevoCodigo(new Uint8Array(10))).toBe("2222222222");
    expect(new Set(Array.from({ length: 200 }, () => nuevoCodigo())).size).toBe(200);
  });
  it("reads a code however it was typed, and nothing else", () => {
    expect(leerCodigo(" k7m2pq9xwz ")).toBe("K7M2PQ9XWZ");
    expect(leerCodigo("K7M2PQ9XW")).toBeNull();
    expect(leerCodigo("K7M2PQ9XW0")).toBeNull();
    expect(leerCodigo("../../etc")).toBeNull();
    expect(urlCalificacion("K7M2PQ9XWZ")).toBe("https://cafepayo.com/c/K7M2PQ9XWZ");
  });
});

describe("normalizarInstagram", () => {
  it("takes what people paste", () => {
    expect(normalizarInstagram("@Cafe.Payo ")).toBe("cafe.payo");
    expect(normalizarInstagram("https://www.instagram.com/Juan_Perez/?hl=es")).toBe("juan_perez");
    expect(normalizarInstagram("instagram.com/maria")).toBe("maria");
  });
  it("rejects what cannot be a handle", () => {
    for (const bad of ["", "@", "juan perez", "juan@correo.com", ".juan", "juan.", "ju..an", "a".repeat(31), "<script>"]) expect(normalizarInstagram(bad), bad).toBeNull();
  });
});

describe("points and lines", () => {
  const lineas = [
    { customer_name: "Ana", unit_price_cop: 8500, qty: 1 },
    { customer_name: "Ana", unit_price_cop: 7000, qty: 2 },
    { customer_name: "Luis", unit_price_cop: 12000, qty: 1 },
    { customer_name: null, unit_price_cop: 3500, qty: 1 },
  ];
  it("one point per thousand pesos, rounded down", () => {
    expect(puntosDe(lineasDe(lineas, "Ana", ["Ana", "Luis"]))).toBe(22);
    expect(puntosDe([{ unit_price_cop: 999, qty: 1 }])).toBe(0);
    expect(puntosDe([])).toBe(0);
  });
  it("the table's label takes what belongs to nobody; no people = the whole order", () => {
    expect(lineasDe(lineas, null, ["Ana", "Luis"])).toHaveLength(1);
    expect(lineasDe(lineas, "Mesa 3", ["Ana", "Luis"])).toHaveLength(1);
    expect(lineasDe(lineas, "Mesa 3", [])).toHaveLength(4);
  });
});

describe("estadoDe / tuPedido", () => {
  const ahora = new Date("2026-10-11T12:00:00Z");
  it("says what a link is worth", () => {
    expect(estadoDe(null, ahora)).toBe("desconocido");
    expect(estadoDe({ usada_at: null, expira_at: "2026-11-01T00:00:00Z" }, ahora)).toBe("valido");
    expect(estadoDe({ usada_at: null, expira_at: "2026-10-11T11:59:00Z" }, ahora)).toBe("vencido");
    expect(estadoDe({ usada_at: "2026-10-11T10:00:00Z", expira_at: "2026-11-01T00:00:00Z" }, ahora)).toBe("usado");
  });
  it("names the drink only when it was one", () => {
    expect(tuPedido([{ name: "Latte frío", qty: 1, opciones: [] }])).toBe("tu Latte frío");
    expect(tuPedido([{ name: "Latte frío", qty: 2, opciones: [] }])).toBe("tu pedido");
    expect(tuPedido([])).toBe("tu pedido");
  });
});
