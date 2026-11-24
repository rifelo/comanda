import { describe, expect, it } from "vitest";
import contenido from "./menu.json";
import { buildMenu, esCafe, fraseDePedido, gruposCafe, money, perfilCon, precioK, type CatalogProduct, type MenuContent } from "./menu";

// The rules below are about following the POS category; the board lists of the real file are tested apart.
const content = { ...(contenido as MenuContent), categories: (contenido as MenuContent).categories.map((c) => ({ ...c, skus: undefined })) } as MenuContent;
const prod = (over: Partial<CatalogProduct> & { sku: string; name: string }): CatalogProduct => ({ price: 7000, stock: "ok", description: null, category: "Frío", options: [], cafe: false, ...over });

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
    expect(frio.items[2]).toMatchObject({ name: "Café dalgona", price: 8500, short: "Crema de café batido sobre leche", p: [3, 4, 1, 5] });
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

describe("perfilCon", () => {
  it("adds what the option changes and stays within 0–5", () => {
    expect(perfilCon([3, 3, 2, 3], [0, 0, 0, 2])).toEqual([3, 3, 2, 5]);
    expect(perfilCon([3, 3, 2, 4], [0, 0, 0, 2])).toEqual([3, 3, 2, 5]);
    expect(perfilCon([4, 2, 4, 1], undefined)).toEqual([4, 2, 4, 1]);
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

describe("precioK", () => {
  it("thousands with a K, decimals only when there are", () => {
    expect(precioK(8500)).toBe("8.5K");
    expect(precioK(7000)).toBe("7K");
    expect(precioK(3000)).toBe("3K");
    expect(precioK(10000)).toBe("10K");
    expect(precioK(1250)).toBe("1.25K");
    expect(precioK(500)).toBe("0.5K");
  });
});

describe("con café / sin café", () => {
  it("recognises coffee ingredients by name", () => {
    expect(esCafe("Cafe Okana")).toBe(true);
    expect(esCafe("Café instantáneo Nescafé")).toBe(true);
    expect(esCafe("Leche entera")).toBe(false);
    expect(esCafe("Cafetera")).toBe(false);
  });
  const menu = buildMenu(
    { ...content, items: { ...content.items, "BC-011": { cafe: true } } },
    [
      prod({ sku: "BF-005", name: "Latte frío", price: 9000, cafe: true }),
      prod({ sku: "BC-011", name: "Milo frío", price: 8000 }),
      prod({ sku: "BF-014", name: "Malteada de chai", price: 7000 }),
      prod({ sku: "JU-001", name: "Jugo de mora", category: "Jugos" }),
    ],
  );
  const frio = menu.find((s) => s.id === "frio")!;
  it("takes the flag from the catalog, overridable in the JSON", () => {
    expect(frio.items.map((i) => [i.sku, i.cafe])).toEqual([["BF-014", false], ["BC-011", true], ["BF-005", true]]);
  });
  it("splits a mixed section «Con café» first, keeping the price order", () => {
    expect(gruposCafe(frio.items).map((g) => [g.label, g.items.map((i) => i.sku)])).toEqual([
      ["Con café", ["BC-011", "BF-005"]],
      ["Sin café", ["BF-014"]],
    ]);
  });
  it("draws no heading when a section is all one kind", () => {
    const jugos = menu.find((s) => s.id === "jugos")!;
    expect(gruposCafe(jugos.items)).toEqual([{ id: "sin", label: null, items: jugos.items }]);
  });
});

describe("a section with its own list (the printed board)", () => {
  const prod = (sku: string, price: number, category = "Frío"): CatalogProduct => ({ sku, name: sku, price, stock: "ok", description: null, category, options: [], cafe: false, image: `https://fotos/${sku}.jpg` });
  const conLista = (skus?: string[]): MenuContent => ({
    ...({} as MenuContent),
    categories: [{ id: "frio", pos: ["Frío"], label: "Frío", sub: "", pair: null, art: null, ...(skus ? { skus } : {}) }],
    items: {},
  });
  it("shows only the listed products, in the list's order, with their photo", () => {
    const m = buildMenu(conLista(["B", "A"]), [prod("A", 9000), prod("B", 12000), prod("C", 5000)]);
    expect(m[0].items.map((i) => i.sku)).toEqual(["B", "A"]);
    expect(m[0].items[0].image).toBe("https://fotos/B.jpg");
  });
  it("without a list it follows the POS category, cheapest first", () => {
    const m = buildMenu(conLista(), [prod("A", 9000), prod("B", 12000), prod("C", 5000)]);
    expect(m[0].items.map((i) => i.sku)).toEqual(["C", "A", "B"]);
  });
});

describe("the real menu file", () => {
  it("lists the board's drinks: 10 hot, 15 cold, 5 juices, none repeated", () => {
    const listas = (contenido as MenuContent).categories.filter((c) => c.skus).map((c) => [c.id, c.skus!.length]);
    expect(listas).toEqual([["caliente", 10], ["frio", 15], ["jugos", 5]]);
    const todos = (contenido as MenuContent).categories.flatMap((c) => c.skus ?? []);
    expect(new Set(todos).size).toBe(todos.length);
  });
});
