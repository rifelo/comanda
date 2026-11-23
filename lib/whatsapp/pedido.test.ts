import { describe, expect, it } from "vitest";
import type { PosCatalog, PosMenuItem } from "@/lib/pos/types";
import { notaPedido, personasDelPedido, validarPedido, type PedidoAgente } from "./pedido";

const latte: PosMenuItem = {
  id: "p-latte", name: "Latte frío", catId: "c", sub: "", sku: "BF-005", price: 8500,
  gluten: false, fav: false, stock: "ok", mods: ["g-size", "g-base"], desc: "", printsLabel: true, spec: [], image: null, recipe: [], prep: [], script: null,
};
const torta: PosMenuItem = { ...latte, id: "p-torta", name: "Torta de naranja", price: 7000, mods: [], stock: "sin" };
const catalog: PosCatalog = {
  cats: [], menu: [latte, torta], top: [], combos: [],
  modGroups: {
    "g-size": { id: "g-size", name: "Tamaño", type: "single", required: false, options: [{ name: "12 oz", delta: 0 }, { name: "16 oz", delta: 2000 }] },
    "g-base": { id: "g-base", name: "Base", type: "single", required: true, options: [{ name: "En agua", delta: 0 }, { name: "En leche", delta: 1000 }] },
  },
  byId: { "p-latte": latte, "p-torta": torta },
  comboById: {}, catLabel: {}, orgName: "Café", instagram: null, sticker: null, cupArt: null, handArt: null, equipo: [], pairs: {}, pago: { transferenciaLlave: null, transferenciaTitular: null, datafonoLiquidacion: null }, recibo: { encabezado: null, pie: null },
};

const pedido = (over: Partial<PedidoAgente> = {}): PedidoAgente => ({
  tipo: "llevar", nombre: "Laura", direccion: null, telefono: null, nota: null,
  lineas: [{ productoId: "p-latte", cantidad: 2, opciones: [{ grupoId: "g-size", opcion: "16 oz" }, { grupoId: "g-base", opcion: "En leche" }] }],
  ...over,
});

describe("empaque de domicilio", () => {
  const bolsa: PosMenuItem = { ...latte, id: "p-empaque", name: "Empaque domicilio", sku: "EM-001", price: 2000, mods: [], printsLabel: false };
  const bebida: PosMenuItem = { ...latte, id: "p-tinto", name: "Tinto", price: 3000, mods: [], empaque: "bebida" };
  const pan: PosMenuItem = { ...latte, id: "p-pan", name: "Pan", price: 4000, mods: [], empaque: "comida" };
  const cat: PosCatalog = { ...catalog, menu: [bebida, pan, bolsa], byId: { "p-tinto": bebida, "p-pan": pan, "p-empaque": bolsa } };
  const dom = (lineas: PedidoAgente["lineas"], tipo: PedidoAgente["tipo"] = "domicilio") =>
    validarPedido(cat, pedido({ tipo, direccion: "Cra 20 #10-30", telefono: "3001234567", lineas }));
  const linea = (productoId: string, cantidad: number) => ({ productoId, cantidad, opciones: [] });

  it("adds one bag per 4 drinks to a delivery", () => {
    const v = dom([linea("p-tinto", 5), linea("p-pan", 1)]);
    expect(v.ok && v.subtotal).toBe(5 * 3000 + 4000 + 2 * 2000);
    expect(v.ok && v.lines.at(-1)).toEqual({ kind: "item", id: "p-empaque", qty: 2, mods: {} });
  });
  it("ignores a bag line sent by the agent and adds its own", () => {
    const v = dom([linea("p-tinto", 1), linea("p-empaque", 3)]);
    expect(v.ok && v.subtotal).toBe(3000 + 2000);
  });
  it("charges nothing for pick-up, nearby points or a delivery without drinks", () => {
    expect((dom([linea("p-tinto", 2)], "llevar") as { subtotal: number }).subtotal).toBe(6000);
    expect((dom([linea("p-tinto", 2)], "cercano") as { subtotal: number }).subtotal).toBe(6000);
    expect((dom([linea("p-pan", 2)]) as { subtotal: number }).subtotal).toBe(8000);
  });
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
    expect(err(pedido({ tipo: "domicilio", direccion: "Cra 20 #10-30", telefono: null }))).toMatch(/teléfono de quien recibe/);
    expect(err(pedido({ nombre: " " }))).toMatch(/nombre/);
    expect(err(pedido({ lineas: [] }))).toMatch(/no tiene productos/);
  });
});

describe("para quién es cada vaso", () => {
  it("puts each person's name on their line so every cup label carries it", () => {
    const tinto = (para: string | null) => ({ productoId: "p-latte", cantidad: 1, opciones: [{ grupoId: "g-base", opcion: "En agua" }], para });
    const v = validarPedido(catalog, pedido({ nombre: "Marielita", lineas: [tinto(" Marielita "), tinto("Paola"), tinto("Yeny"), tinto(null)] }));
    expect(v.ok && v.lines.map((l) => l.customer)).toEqual(["Marielita", "Paola", "Yeny", undefined]);
    expect(v.ok && personasDelPedido(v.lines)).toEqual(["Marielita", "Paola", "Yeny"]);
  });

  it("dedupes names regardless of case", () => {
    expect(personasDelPedido([
      { kind: "item", id: "a", qty: 1, mods: {}, customer: "Aleja" },
      { kind: "item", id: "a", qty: 1, mods: {}, customer: "aleja" },
      { kind: "item", id: "a", qty: 1, mods: {} },
    ])).toEqual(["Aleja"]);
  });
});

describe("notaPedido", () => {
  it("puts the phone, the delivery and the customer's note on the ticket", () => {
    expect(notaPedido(pedido({ tipo: "domicilio", direccion: " Cra 20 #10-30 ", telefono: "310 111 2233", nota: "Sin azúcar" }), "573150000000"))
      .toBe("WhatsApp +573150000000 · Domicilio: Cra 20 #10-30 · Recibe Laura, tel 3101112233 · Sin azúcar");
    expect(notaPedido(pedido(), "573150000000")).toBe("WhatsApp +573150000000 · Para llevar");
  });
});
