import { describe, it, expect } from "vitest";
import { prefijoDeNombre, sugerirSku } from "./sku";

describe("sugerirSku", () => {
  it("continues the prefix the category already uses", () => {
    expect(sugerirSku({ categoriaLabel: "Bebidas · Frías", skusCategoria: ["BF-001", "BF-009", "BF-010"], todos: ["BF-001", "BF-009", "BF-010", "BC-014"] })).toBe("BF-011");
  });
  it("takes the next number across every product with that prefix", () => {
    expect(sugerirSku({ categoriaLabel: "Jugos", skusCategoria: ["JU-001"], todos: ["JU-001", "JU-005"] })).toBe("JU-006");
  });
  it("derives a prefix from the name of an empty category", () => {
    expect(sugerirSku({ categoriaLabel: "Postres", skusCategoria: [], todos: [] })).toBe("POS-001");
    expect(sugerirSku({ categoriaLabel: null, skusCategoria: [], todos: [] })).toBe("PRO-001");
  });
});

describe("prefijoDeNombre", () => {
  it("uses initials of multi-word names and drops accents", () => {
    expect(prefijoDeNombre("Bebidas · Café de especialidad")).toBe("CDE");
    expect(prefijoDeNombre("Té")).toBe("TE");
  });
});
