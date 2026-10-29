import { describe, expect, it } from "vitest";
import type { PosCatalog, PosMenuItem } from "@/lib/pos/types";
import { notaPedido, validarPedido, type PedidoAgente } from "./pedido";

const latte: PosMenuItem = {
  id: "p-latte", name: "Latte frío", catId: "c", sub: "", sku: "BF-005", price: 8500,
  gluten: false, fav: false, stock: "ok", mods: ["g-size", "g-base"], desc: "", printsLabel: true, spec: [], image: null, recipe: [], prep: [],
};
const torta: PosMenuItem = { ...latte, id: "p-torta", name: "Torta de naranja", price: 7000, mods: [], stock: "sin" };
const catalog: PosCatalog = {
  cats: [], menu: [latte, torta], top: [], combos: [],
  modGroups: {
    "g-size": { id: "g-size", name: "Tamaño", type: "single", required: false, options: [{ name: "12 oz", delta: 0 }, { name: "16 oz", delta: 2000 }] },
    "g-base": { id: "g-base", name: "Base", type: "single", required: true, options: [{ name: "En agua", delta: 0 }, { name: "En leche", delta: 1000 }] },
  },
  byId: { "p-latte": latte, "p-torta": torta },
  comboById: {}, catLabel: {}, orgName: "Café", instagram: null, sticker: null, cupArt: null, handArt: null, equipo: [],
};

const pedido = (over: Partial<PedidoAgente> = {}): PedidoAgente => ({
  tipo: "llevar", nombre: "Laura", direccion: null, nota: null,
  lineas: [{ productoId: "p-latte", cantidad: 2, opciones: [{ grupoId: "g-size", opcion: "16 oz" }, { grupoId: "g-base", opcion: "En leche" }] }],
  ...over,
});

describe("validarPedido", () => {
  it("prices the lines from the catalog, options included", () => {
    const v = validarPedido(catalog, pedido());
    expect(v.ok && v.subtotal).toBe(2 * (8500 + 2000 + 1000));
    expect(v.ok && v.lines).toEqual([{ kind: "item", id: "p-latte", qty: 2, mods: { "g-size": "16 oz", "g-base": "En leche" } }]);
  });

  it("asks for what is missing or wrong instead of guessing", () => {
    const err = (p: PedidoAgente) => {
      const v = validarPedido(catalog, p);
      return v.ok ? null : v.error;
    };
    expect(err(pedido({ lineas: [{ productoId: "p-torta", cantidad: 1, opciones: [] }] }))).toBe("Torta de naranja está agotado hoy.");
    expect(err(pedido({ lineas: [{ productoId: "p-nada", cantidad: 1, opciones: [] }] }))).toMatch(/no existe/);
    expect(err(pedido({ lineas: [{ productoId: "p-latte", cantidad: 1, opciones: [{ grupoId: "g-size", opcion: "20 oz" }, { grupoId: "g-base", opcion: "En agua" }] }] }))).toMatch(/20 oz/);
    expect(err(pedido({ lineas: [{ productoId: "p-latte", cantidad: 1, opciones: [] }] }))).toBe("Falta elegir Base para Latte frío.");
    expect(err(pedido({ tipo: "domicilio", direccion: "  " }))).toMatch(/dirección/);
    expect(err(pedido({ nombre: " " }))).toMatch(/nombre/);
    expect(err(pedido({ lineas: [] }))).toMatch(/no tiene productos/);
  });
});

describe("notaPedido", () => {
  it("puts the phone, the delivery and the customer's note on the ticket", () => {
    expect(notaPedido(pedido({ tipo: "domicilio", direccion: " Cra 20 #10-30 ", nota: "Sin azúcar" }), "573150000000"))
      .toBe("WhatsApp +573150000000 · Domicilio: Cra 20 #10-30 · Sin azúcar");
    expect(notaPedido(pedido(), "573150000000")).toBe("WhatsApp +573150000000 · Para llevar");
  });
});
