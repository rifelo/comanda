import { describe, expect, it } from "vitest";
import { agregarPara, enlaceWhatsapp, faltaPara, lineasDelPedido, mensajePedido, nombrar, sumar, totalPedido, unidades, type ProductoCarrito } from "./pedido-web";

const menu = new Map<string, ProductoCarrito>([
  ["BF-005", { sku: "BF-005", name: "Latte frío", price: 8500, agotado: false, options: [], cat: "frio" }],
  ["PO-001", { sku: "PO-001", name: "Torta", price: 6000, agotado: false, options: [], cat: "postres" }],
  ["JU-001", { sku: "JU-001", name: "Jugo de mora", price: 7000, agotado: false, options: [{ name: "En agua", delta: 0 }, { name: "En leche", delta: 1000 }] }],
  ["BF-009", { sku: "BF-009", name: "Tinto tónico", price: 12000, agotado: false, options: [], sizes: [{ name: "12 oz", delta: 0 }, { name: "16 oz", delta: 1500 }], cat: "frio" }],
  ["BC-003", { sku: "BC-003", name: "Tinto", price: 3000, agotado: true, options: [] }],
]);

describe("sumar", () => {
  it("agrega, acumula y quita la línea al llegar a 0", () => {
    let c = sumar([], { sku: "BF-005", opcion: null }, 1);
    c = sumar(c, { sku: "BF-005", opcion: null }, 1);
    expect(c).toEqual([{ sku: "BF-005", opcion: null, cantidad: 2 }]);
    expect(sumar(c, { sku: "BF-005", opcion: null }, -2)).toEqual([]);
  });
  it("el mismo jugo en agua y en leche son dos líneas", () => {
    const c = sumar(sumar([], { sku: "JU-001", opcion: "En agua" }, 1), { sku: "JU-001", opcion: "En leche" }, 1);
    expect(c).toHaveLength(2);
  });
  it("no pasa de 20 por línea ni crea líneas en 0", () => {
    expect(sumar([], { sku: "BF-005", opcion: null }, 99)[0].cantidad).toBe(20);
    expect(sumar([], { sku: "BF-005", opcion: null }, -1)).toEqual([]);
  });
});

describe("lineasDelPedido", () => {
  it("pone nombre y precio, con el recargo de la opción", () => {
    const l = lineasDelPedido([{ sku: "BF-005", opcion: null, cantidad: 2 }, { sku: "JU-001", opcion: "En leche", cantidad: 1 }], menu);
    expect(l.map((x) => x.total)).toEqual([17000, 8000]);
    expect(totalPedido(l)).toBe(25000);
    expect(unidades(l)).toBe(3);
  });
  it("deja fuera lo agotado, lo que ya no está y las opciones que no existen", () => {
    const l = lineasDelPedido(
      [
        { sku: "BC-003", opcion: null, cantidad: 1 },
        { sku: "XX-999", opcion: null, cantidad: 1 },
        { sku: "JU-001", opcion: "En soda", cantidad: 1 },
        { sku: "JU-001", opcion: null, cantidad: 1 },
        { sku: "BF-005", opcion: "En leche", cantidad: 1 },
      ],
      menu,
    );
    expect(l).toEqual([]);
  });
});

describe("mensajePedido", () => {
  const lineas = lineasDelPedido([{ sku: "BF-005", opcion: null, cantidad: 2 }, { sku: "JU-001", opcion: "En leche", cantidad: 1 }], menu);
  it("lista los productos, el total, la entrega y el nombre", () => {
    expect(mensajePedido(lineas, { nombre: "  Ana  ", entrega: { tipo: "domicilio", direccion: "Cra 20 # 8-15" }, nota: "sin azúcar" })).toBe(
      ["Hola, quiero hacer este pedido:", "• 2 × Latte frío — $17.000", "• 1 × Jugo de mora (en leche) — $8.000", "Total productos: $25.000", "Domicilio: Cra 20 # 8-15", "A nombre de: Ana", "Nota: sin azúcar"].join("\n"),
    );
  });
  it("recoger y punto de entrega", () => {
    expect(mensajePedido(lineas, { nombre: "Ana", entrega: { tipo: "recoger" } })).toContain("Entrega: lo recojo en el café");
    expect(mensajePedido(lineas, { nombre: "Ana", entrega: { tipo: "punto", lugar: "la portería de ESE Salud Yopal" } })).toContain("Entrega: la portería de ESE Salud Yopal");
  });
  it("el enlace lleva el texto codificado al WhatsApp del café", () => {
    expect(enlaceWhatsapp("Hola\n• 1 × Tinto")).toBe("https://wa.me/573001269607?text=Hola%0A%E2%80%A2%201%20%C3%97%20Tinto");
  });
});

describe("faltaPara", () => {
  const lineas = lineasDelPedido([{ sku: "BF-005", opcion: null, cantidad: 1 }], menu);
  it("pide productos, nombre y dirección del domicilio", () => {
    expect(faltaPara([], "Ana", { tipo: "recoger" })).toMatch(/producto/);
    expect(faltaPara(lineas, " ", { tipo: "recoger" })).toMatch(/nombre/);
    expect(faltaPara(lineas, "Ana", { tipo: "domicilio", direccion: "  " })).toMatch(/dirección/);
    expect(faltaPara(lineas, "Ana", { tipo: "domicilio", direccion: "Cra 20 # 8-15" })).toBeNull();
  });
});

describe("nombres por vaso", () => {
  it("cada vaso de una bebida lleva su nombre; lo que no es bebida, no", () => {
    let c = sumar(sumar([], { sku: "BF-005", opcion: null }, 2), { sku: "PO-001", opcion: null }, 1);
    c = nombrar(c, { sku: "BF-005", opcion: null }, 1, "Luis");
    const l = lineasDelPedido(c, menu);
    expect(l[0]).toMatchObject({ conNombre: true, para: ["", "Luis"] });
    expect(l[1]).toMatchObject({ conNombre: false, para: [] });
    const m = mensajePedido(l, { nombre: "Ana", entrega: { tipo: "recoger" } });
    expect(m).toContain("• 2 × Latte frío — $17.000 · para Ana, Luis");
    expect(m).toContain("• 1 × Torta — $6.000\n");
  });
  it("sin nombres escritos la línea no dice para quién, y quitar un vaso quita su nombre", () => {
    const c = sumar([], { sku: "BF-005", opcion: null }, 2);
    expect(mensajePedido(lineasDelPedido(c, menu), { nombre: "Ana", entrega: { tipo: "recoger" } })).toContain("• 2 × Latte frío — $17.000\n");
    const d = sumar(nombrar(c, { sku: "BF-005", opcion: null }, 1, "Luis"), { sku: "BF-005", opcion: null }, -1);
    expect(d[0].para).toEqual([""]);
    expect(nombrar(c, { sku: "BF-005", opcion: null }, 5, "X")).toEqual(c);
  });
  it("agregar desde la ficha pone el nombre a los vasos nuevos, sin tocar los que ya estaban", () => {
    let c = agregarPara([], { sku: "BF-005", opcion: null }, 1, " Ana ");
    c = agregarPara(c, { sku: "BF-005", opcion: null }, 2, "Luis");
    expect(c).toEqual([{ sku: "BF-005", opcion: null, cantidad: 3, para: ["Ana", "Luis", "Luis"] }]);
  });
});

describe("tamaños", () => {
  it("12 y 16 oz son líneas distintas, con su recargo y su nombre en el mensaje", () => {
    let c = sumar([], { sku: "BF-009", opcion: null, tamano: "12 oz" }, 1);
    c = sumar(c, { sku: "BF-009", opcion: null, tamano: "16 oz" }, 2);
    const l = lineasDelPedido(c, menu);
    expect(l.map((x) => [x.tamano, x.total])).toEqual([["12 oz", 12000], ["16 oz", 27000]]);
    expect(mensajePedido(l, { nombre: "Ana", entrega: { tipo: "recoger" } })).toContain("• 2 × Tinto tónico 16 oz — $27.000");
  });
  it("sin tamaño guardado, o con uno que ya no existe, va el primero", () => {
    const l = lineasDelPedido([{ sku: "BF-009", opcion: null, cantidad: 1 }, { sku: "BF-009", opcion: null, tamano: "20 oz", cantidad: 1 }], menu);
    expect(l.map((x) => x.tamano)).toEqual(["12 oz", "12 oz"]);
  });
});
