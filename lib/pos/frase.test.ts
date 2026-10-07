import { describe, expect, it } from "vitest";
import { pickCategoria, pickCategoriaBebida, fraseBebida, sanitizeFrase, FRASE_MAX } from "./frase";

describe("pickCategoria", () => {
  it("maps the random draw to weighted categories", () => {
    expect(pickCategoria(0)).toBe("gracioso");
    expect(pickCategoria(0.44)).toBe("gracioso");
    expect(pickCategoria(0.5)).toBe("motivador");
    expect(pickCategoria(0.85)).toBe("noticia");
  });
});

describe("pickCategoriaBebida", () => {
  it("never takes the news path", () => {
    expect(pickCategoriaBebida(0)).toBe("gracioso");
    expect(pickCategoriaBebida(0.54)).toBe("gracioso");
    expect(pickCategoriaBebida(0.55)).toBe("motivador");
    expect(pickCategoriaBebida(0.999)).toBe("motivador");
  });
});

describe("fraseBebida", () => {
  it("names the drink and knows when it has no coffee", () => {
    expect(fraseBebida({ name: "  Milo   frío ", desc: "Milo, leche y hielo", spec: ["SIN CAFÉ"] }))
      .toEqual({ nombre: "Milo frío", descripcion: "Milo, leche y hielo", sinCafe: true });
    expect(fraseBebida({ name: "Latte", desc: "", spec: ["1 SHOT · 9 G"] }))
      .toEqual({ nombre: "Latte", descripcion: undefined, sinCafe: false });
    expect(fraseBebida({ name: "Tinto" }).sinCafe).toBe(false);
  });
});

describe("sanitizeFrase", () => {
  it("collapses whitespace and strips wrapping quotes", () => {
    expect(sanitizeFrase('  "Un  café\n y a volar" ')).toBe("Un café y a volar");
    expect(sanitizeFrase("«Tinto primero, mundo después»")).toBe("Tinto primero, mundo después");
  });
  it("strips citation markers left by web search", () => {
    expect(sanitizeFrase("¡Bacteria colombiana limpia el agua!【1†L9-L13】 [2]")).toBe("¡Bacteria colombiana limpia el agua!");
  });
  it("removes emoji, keeping accents and Spanish punctuation", () => {
    expect(sanitizeFrase("Un día sin café es de noche 😴☕️ ¡ánimo! 👍🏽 🇨🇴")).toBe("Un día sin café es de noche ¡ánimo!");
    expect(sanitizeFrase("☕ Primero el tinto, después el mundo 🚀")).toBe("Primero el tinto, después el mundo");
  });
  it("caps overlong text on a word boundary", () => {
    const long = "palabra ".repeat(40);
    const out = sanitizeFrase(long);
    expect(out.length).toBeLessThanOrEqual(FRASE_MAX + 1);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/ …$/);
  });
});
