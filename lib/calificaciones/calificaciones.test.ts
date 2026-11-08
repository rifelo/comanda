import { describe, expect, it } from "vitest";
import { diaDeVisita, estadoDe, leerCodigo, lineasDe, lineasDeQr, normalizarInstagram, nuevoCodigo, puntosDe, reubicarCopas, tuPedido, urlCalificacion, type LineaCopa, type QrCopa } from "./calificaciones";

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

describe("lineasDeQr", () => {
  const l = (position: number, name: string, qty: number, price: number, customer_name: string | null = null) => ({ position, name, qty, unit_price_cop: price, customer_name });
  // Juan: 2 lattes (line 0) + a cake (line 1); María: 1 tinto (line 2).
  const lineas = [l(0, "Latte", 2, 9000, "Juan"), l(1, "Torta", 1, 8000, "Juan"), l(2, "Tinto", 1, 3000, "María")];
  const people = ["Juan", "María"];
  const copasJuan = new Set([0]);

  it("one QR per cup: the first takes the rest, together they add up to what the person bought", () => {
    const a = lineasDeQr(lineas, "Juan", people, { linea: 0, resto: true }, copasJuan);
    const b = lineasDeQr(lineas, "Juan", people, { linea: 0, resto: false }, copasJuan);
    expect(a.map((x) => `${x.qty}×${x.name}`)).toEqual(["1×Latte", "1×Torta"]);
    expect(b.map((x) => `${x.qty}×${x.name}`)).toEqual(["1×Latte"]);
    expect(puntosDe(a) + puntosDe(b)).toBe(puntosDe(lineas.slice(0, 2)));
  });
  it("never reaches into another person's lines", () => {
    expect(lineasDeQr(lineas, "María", people, { linea: 0, resto: true }, new Set([2]))).toEqual([]);
    expect(lineasDeQr(lineas, "María", people, { linea: 2, resto: true }, new Set([2])).map((x) => x.name)).toEqual(["Tinto"]);
  });
  it("an older QR without a line is worth everything the person bought", () => {
    expect(lineasDeQr(lineas, "Juan", people, { linea: null, resto: false }, copasJuan).map((x) => x.name)).toEqual(["Latte", "Torta"]);
  });
  it("a line that no longer exists (edited order) is worth nothing but the rest", () => {
    expect(lineasDeQr(lineas, "Juan", people, { linea: 7, resto: false }, new Set([7]))).toEqual([]);
  });
});

describe("diaDeVisita", () => {
  const ahora = new Date("2026-10-24T18:00:00Z");
  it("day and month in Bogotá time, without the year when it is this one", () => {
    expect(diaDeVisita("2026-10-23T15:00:00Z", ahora)).toBe("23 de octubre");
    // 01:00 UTC on the 24th is still the 23rd in Bogotá.
    expect(diaDeVisita("2026-10-24T01:00:00Z", ahora)).toBe("23 de octubre");
  });
  it("adds the year for another one", () => {
    expect(diaDeVisita("2025-12-31T20:00:00Z", ahora)).toBe("31 de diciembre de 2025");
  });
});

describe("reubicarCopas", () => {
  const L = (position: number, producto_id: string, customer_name: string | null = null, mods: unknown = {}): LineaCopa =>
    ({ position, kind: "item", producto_id, combo_id: null, name: producto_id, mods, customer_name });
  const qr = (id: string, linea_position: number | null, customer_name: string | null = null): QrCopa => ({ id, linea_position, customer_name });

  it("leaves QRs alone when nothing moved", () => {
    const ls = [L(0, "latte", "Ana"), L(1, "tinto", "Bea")];
    expect(reubicarCopas(ls, ls, [qr("a", 0, "Ana"), qr("b", 1, "Bea")])).toEqual([]);
  });
  it("follows a drink when a line before it is removed", () => {
    const viejas = [L(0, "capu", "Xiommy"), L(1, "capu", "Liseth"), L(2, "torta")];
    const nuevas = [L(0, "capu", "Liseth"), L(1, "torta")];
    expect(reubicarCopas(viejas, nuevas, [qr("x", 0, "Xiommy"), qr("l", 1, "Liseth")])).toEqual([
      { id: "x", linea_position: 2, customer_name: "Xiommy" },
      { id: "l", linea_position: 0, customer_name: "Liseth" },
    ]);
  });
  it("takes the person a cup is given to later (split by person)", () => {
    const viejas = [L(0, "latte"), L(1, "latte")];
    const nuevas = [L(0, "latte", "Ana"), L(1, "latte", "Bea")];
    expect(reubicarCopas(viejas, nuevas, [qr("a", 0), qr("b", 1)])).toEqual([
      { id: "a", linea_position: 0, customer_name: "Ana" },
      { id: "b", linea_position: 1, customer_name: "Bea" },
    ]);
  });
  it("prefers the exact options, then the same product with other options", () => {
    const viejas = [L(0, "jugo", null, { base: "En agua" }), L(1, "jugo", null, { base: "En leche" })];
    // Leche keeps its exact line even though agua comes first; agua takes the other jugo.
    const nuevas = [L(0, "tinto"), L(1, "jugo", null, { base: "En leche" }), L(2, "jugo", null, { base: "En leche" })];
    const r = reubicarCopas(viejas, nuevas, [qr("agua", 0), qr("leche", 1)]);
    expect(r).toEqual([{ id: "agua", linea_position: 2, customer_name: null }]);
  });
  it("moves reprints of one cup together and ignores whole-person QRs", () => {
    const viejas = [L(0, "tinto"), L(1, "latte")];
    const nuevas = [L(0, "latte")];
    expect(reubicarCopas(viejas, nuevas, [qr("a", 1), qr("a2", 1), qr("old", null)])).toEqual([
      { id: "a", linea_position: 0, customer_name: null },
      { id: "a2", linea_position: 0, customer_name: null },
    ]);
  });
  it("never lands two different cups on one line", () => {
    const viejas = [L(0, "latte", "Ana"), L(1, "latte", "Ana")];
    const nuevas = [L(0, "latte", "Ana")];
    const r = reubicarCopas(viejas, nuevas, [qr("a", 0, "Ana"), qr("b", 1, "Ana")]);
    expect(r).toEqual([{ id: "b", linea_position: 2, customer_name: "Ana" }]);
  });
});
