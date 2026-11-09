import { describe, expect, it } from "vitest";
import { elegirFavoritas } from "./home-rules";
import type { MenuItem, MenuSection } from "./menu";

const item = (sku: string, name: string, extra: Partial<MenuItem> = {}): MenuItem => ({
  sku, cat: "", name, price: 8500, short: `${name} rico`, desc: "", lleva: [], p: null, tags: [], nuevo: false, agotado: false, options: [], cafe: true, ...extra,
});
const secciones: MenuSection[] = [
  { id: "frio", label: "Frío", sub: "", art: null, pair: null, items: [item("BF-008", "Café dalgona"), item("BF-012", "Latte frío"), item("BF-020", "Té frío", { cafe: false })] },
  { id: "caliente", label: "Caliente", sub: "", art: null, pair: null, items: [item("BC-001", "Cappuccino"), item("BC-002", "Mocca", { agotado: true })] },
  { id: "postres", label: "Postres", sub: "", art: null, pair: null, items: [item("PO-001", "Brownie", { cafe: false })] },
];

describe("elegirFavoritas", () => {
  it("promo first, then the month's best sellers, up to n", () => {
    const f = elegirFavoritas(secciones, ["BF-008", "BF-012"], new Map([["PO-001", 3], ["BC-001", 9]]), 3);
    expect(f.map((x) => x.name)).toEqual(["Café dalgona", "Latte frío", "Cappuccino"]);
    expect(f[0].nota).toBe("Frío, con café");
    expect(f[2].nota).toBe("Caliente, con café");
  });
  it("skips sold-out, unknown and repeated SKUs; non-bar items use their one-liner", () => {
    const f = elegirFavoritas(secciones, ["XX-999", "BC-002", "BF-020"], new Map([["BF-020", 5], ["PO-001", 2]]), 3);
    expect(f.map((x) => x.sku)).toEqual(["BF-020", "PO-001"]);
    expect(f[0].nota).toBe("Frío, sin café");
    expect(f[1].nota).toBe("Brownie rico");
  });
});
