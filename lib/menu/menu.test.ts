import { describe, expect, it } from "vitest";
import contenido from "./menu.json";
import { buildMenu, fraseDePedido, money, type CatalogProduct, type MenuContent } from "./menu";

const content = contenido as MenuContent;
const prod = (over: Partial<CatalogProduct> & { sku: string; name: string }): CatalogProduct => ({ price: 7000, stock: "ok", description: null, category: "Frío", options: [], ...over });

describe("buildMenu", () => {
  const menu = buildMenu(content, [
    prod({ sku: "BF-008", name: "Café dalgona", price: 8500 }),
    prod({ sku: "BF-003", name: "Matcha latte frío", price: 0 }),
    prod({ sku: "BF-006", name: "Americano frío", price: 6000, stock: "sin" }),
    prod({ sku: "BF-099", name: "Nuevo del POS", description: "Recién llegado. Con hielo." }),
    prod({ sku: "BE-003", name: "Kombucha Maracuyá", category: "Kombucha", price: 8500 }),
    prod({ sku: "JU-001", name: "Jugo de mora", category: "Jugos", options: [{ name: "En agua", delta: 0 }, { name: "En leche", delta: 1000 }] }),
    prod({ sku: "XX-001", name: "Sin sección", category: "Otra cosa" }),
  ]);
  const frio = menu.find((s) => s.id === "frio")!;
  it("takes name, price and stock from the catalog, the copy from the JSON, cheapest first", () => {
    expect(frio.items.map((i) => i.sku)).toEqual(["BF-006", "BF-099", "BF-008"]);
    expect(frio.items[2]).toMatchObject({ name: "Café dalgona", price: 8500, short: "Crema de café batido sobre leche", p: [3, 4, 1, 4] });
    expect(frio.items[0].agotado).toBe(true);
  });
  it("hides what has no price or no section, and drops empty sections", () => {
    expect(menu.flatMap((s) => s.items).some((i) => i.sku === "BF-003" || i.sku === "XX-001")).toBe(false);
    expect(menu.map((s) => s.id)).toEqual(["frio", "jugos", "kombucha"]);
  });
  it("a product the JSON does not know shows with its catalog description", () => {
    expect(frio.items[1]).toMatchObject({ name: "Nuevo del POS", short: "Recién llegado", desc: "Recién llegado. Con hielo.", tags: [], p: null });
  });
  it("name override, options, and pairings only when the product is on the menu", () => {
    expect(menu.find((s) => s.id === "kombucha")!.items[0].name).toBe("Kombucha de maracuyá");
    expect(menu.find((s) => s.id === "jugos")!.items[0].options).toHaveLength(2);
    expect(frio.pair).toBeNull();
  });
});

describe("the content file", () => {
  it("has four profile values wherever it has a profile, and known moods", () => {
    const moods = new Set(content.moods.map((m) => m.id));
    for (const [sku, it] of Object.entries(content.items)) {
      if (it.p) expect(it.p, sku).toHaveLength(4);
      for (const t of it.tags ?? []) expect(moods.has(t), `${sku}: ${t}`).toBe(true);
    }
  });
});

describe("money / fraseDePedido", () => {
  it("formats", () => {
    expect(money(8500)).toBe("$8.500");
    expect(money(12000)).toBe("$12.000");
    expect(money(900)).toBe("$900");
    expect(fraseDePedido("Jugo de mora", "En leche")).toBe("«Jugo de mora en leche»");
    expect(fraseDePedido("Latte frío", null)).toBe("«Latte frío»");
  });
});
