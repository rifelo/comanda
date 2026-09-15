import { describe, expect, it } from "vitest";
import { pickCategoria, sanitizeFrase, FRASE_MAX } from "./frase";

describe("pickCategoria", () => {
  it("maps the random draw to weighted categories", () => {
    expect(pickCategoria(0)).toBe("gracioso");
    expect(pickCategoria(0.44)).toBe("gracioso");
    expect(pickCategoria(0.5)).toBe("motivador");
    expect(pickCategoria(0.85)).toBe("noticia");
  });
});

describe("sanitizeFrase", () => {
  it("collapses whitespace and strips wrapping quotes", () => {
    expect(sanitizeFrase('  "Un  café ☕\n y a volar" ')).toBe("Un café ☕ y a volar");
    expect(sanitizeFrase("«Tinto primero, mundo después» 😴")).toBe("Tinto primero, mundo después» 😴");
  });
  it("caps overlong text on a word boundary", () => {
    const long = "palabra ".repeat(40);
    const out = sanitizeFrase(long);
    expect(out.length).toBeLessThanOrEqual(FRASE_MAX + 1);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/ …$/);
  });
});
