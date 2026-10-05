import { describe, it, expect } from "vitest";
import { tokens, parecidos, mismoNombre, unidadSugerida } from "./propuestas";

const items = ["Vaso 7 oz", "Vaso Darnel PET 12 oz", "Tapa vaso 7 oz", "Leche entera Gran Vía (bolsa 900 ml)", "Servilletas", "Azúcar"].map((name) => ({ name }));

describe("tokens", () => {
  it("drops accents, punctuation, filler words and plural s", () => {
    expect(tokens("Bolsas de Azúcar x 5")).toEqual(["bolsa", "azucar", "5"]);
    expect(tokens("  ")).toEqual([]);
  });
});

describe("parecidos", () => {
  it("finds an item while its name is still being typed", () => {
    expect(parecidos("serv", items).map((i) => i.name)).toEqual(["Servilletas"]);
    expect(parecidos("leche", items).map((i) => i.name)).toEqual(["Leche entera Gran Vía (bolsa 900 ml)"]);
  });
  it("ranks the closest spelling first", () => {
    expect(parecidos("vasos 7 oz", items).map((i) => i.name)[0]).toBe("Vaso 7 oz");
    expect(parecidos("azucar", items).map((i) => i.name)).toEqual(["Azúcar"]);
  });
  it("returns nothing for something new or too short", () => {
    expect(parecidos("jabón de loza", items)).toEqual([]);
    expect(parecidos("v", items)).toEqual([]);
    expect(parecidos("", items)).toEqual([]);
  });
});

describe("mismoNombre", () => {
  it("treats spellings of one item as the same", () => {
    expect(mismoNombre("vaso darnel pet x 12Oz", "Vaso Darnel PET 12 oz")).toBe(false); // "12oz" ≠ "12 oz": needs a human
    expect(mismoNombre("Azucar", "azúcar")).toBe(true);
    expect(mismoNombre("Servilleta", "Servilletas")).toBe(true);
    expect(mismoNombre("Vaso 7 oz", "Tapa vaso 7 oz")).toBe(false);
  });
});

describe("unidadSugerida", () => {
  it("keeps a real stock unit and falls back to und", () => {
    expect(unidadSugerida("g")).toBe("g");
    expect(unidadSugerida("bolsa")).toBe("und");
  });
});
