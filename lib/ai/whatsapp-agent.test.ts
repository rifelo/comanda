import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { enBurbujas, fichaParaAgente, historialComoMensajes, pulirBurbuja } from "./whatsapp-agent";

describe("enBurbujas", () => {
  it("splits on blank lines and trims", () => {
    expect(enBurbujas("¡Buen día, Doc! ☕\n\n  ¿Te preparamos algo?  ")).toEqual(["Buen día, Doc! ☕", "Te preparamos algo?"]);
  });
  it("keeps single line breaks inside a bubble", () => {
    expect(enBurbujas("1 americano\nTotal: $5.000")).toEqual(["1 americano\nTotal: $5.000"]);
  });
  it("folds extra bubbles into the last one", () => {
    expect(enBurbujas("a\n\nb\n\nc\n\nd\n\ne", 3)).toEqual(["a", "b", "c\n\nd\n\ne"]);
  });
  it("returns nothing for an empty reply", () => {
    expect(enBurbujas("  \n\n ")).toEqual([]);
  });
});

describe("fichaParaAgente", () => {
  it("says the customer is new without a file", () => {
    expect(fichaParaAgente(null)).toContain("cliente nuevo");
  });
  it("lists what we know and the latest orders", () => {
    const t = fichaParaAgente({
      perfil: "Bibiana Perez",
      trato: "Doc. Bibiana",
      habitual: "Americano",
      entrega: "portería",
      pago: "Nequi",
      preferencias: "leche deslactosada; 12 oz",
      notas: null,
      habitos: ["Tamaño: 12 oz (3 de 3 veces)"],
      pedidos: ["14 nov: 1 Americano (a portería)"],
    });
    expect(t).toContain("Doc. Bibiana");
    expect(t).toContain("Pedido de siempre: Americano");
    expect(t).toContain("Notas: —");
    expect(t).toContain("Preferencias: leche deslactosada; 12 oz");
    expect(t).toContain("Tamaño: 12 oz (3 de 3 veces)");
    expect(t).toContain("14 nov: 1 Americano");
  });
});

describe("historialComoMensajes", () => {
  it("keeps agent bubbles apart with a blank line", () => {
    const m = historialComoMensajes([
      { autor: "cliente", texto: "Hola" },
      { autor: "agente", texto: "¡Buen día!" },
      { autor: "agente", texto: "¿Te preparamos algo?" },
    ]);
    expect(m[1]).toEqual({ role: "assistant", content: "¡Buen día!\n\n¿Te preparamos algo?" });
  });
});

describe("pulirBurbuja", () => {
  it("drops opening ¡ ¿ and the full stop that closes a line", () => {
    expect(pulirBurbuja("¡Listo! Tu pedido quedó.")).toBe("Listo! Tu pedido quedó");
    expect(pulirBurbuja("Hola, ¿cómo estás?")).toBe("Hola, cómo estás?");
    expect(pulirBurbuja("1 americano\nTotal: $5.000.")).toBe("1 americano\nTotal: $5.000");
  });
  it("keeps prices, ellipses and emojis", () => {
    expect(pulirBurbuja("Son $12.500")).toBe("Son $12.500");
    expect(pulirBurbuja("Déjame ver...")).toBe("Déjame ver...");
    expect(pulirBurbuja("Gracias. ☕")).toBe("Gracias. ☕");
  });
});
