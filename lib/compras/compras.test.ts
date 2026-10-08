import { describe, expect, it } from "vitest";
import { agruparPorProveedor, diasLegibles, diasParaPedir, fechaMas, mensajePedido, porPedir, tocaHoy, waLink, type PedirItem } from "./compras";

const item = (over: Partial<PedirItem> & { id: string; name: string }): PedirItem => ({
  unit: "und", stock: 100, stock_critico: 0, stock_min: 0, stock_objetivo: null, pack_qty: null, pack_label: null, pieza_qty: null, proveedor_id: null, ...over,
});
const leche = item({ id: "leche", name: "Leche", unit: "ml", stock: 1800, stock_critico: 900, stock_min: 2700, stock_objetivo: 10800, pack_qty: 5400, pieza_qty: 900, pack_label: "bolsa", proveedor_id: "p1" });
const vasos = item({ id: "vasos", name: "Vasos", stock: 400, stock_min: 100, pack_qty: 50, proveedor_id: "p2" });
const cafe = item({ id: "cafe", name: "Café", unit: "g", stock: 0, stock_min: 500, stock_objetivo: 2500, proveedor_id: "p1" });
const vacio = { faltantes: [], solicitudes: [], enCamino: {} };

describe("porPedir", () => {
  it("lists what is under its reorder point, in whole lots, red first", () => {
    const l = porPedir({ items: [leche, vasos, cafe], ...vacio });
    expect(l.map((x) => x.key)).toEqual(["cafe", "leche"]);
    expect(l[0]).toMatchObject({ nivel: "rojo", qty: 2500, motivos: ["nivel"] });
    expect(l[1]).toMatchObject({ nivel: "amarillo", qty: 10800, legible: "12 bolsas" });
  });
  it("adds what the team flagged or asked for, even when the level is fine", () => {
    const l = porPedir({
      items: [vasos],
      faltantes: [{ id: "f1", ingrediente_id: "vasos", estado: "bajo", note: "quedan pocos" }],
      solicitudes: [{ id: "s1", ingrediente_id: "vasos", nombre: null, qty: 120, note: null, requested_by_name: "Pipe", requested_at: "" }],
      enCamino: {},
    });
    expect(l[0]).toMatchObject({ qty: 150, motivos: ["faltante", "solicitud"], solicitudIds: ["s1"], faltanteIds: ["f1"], notas: ["quedan pocos"] });
  });
  it("one lot when nothing says how much; free text goes as its own line", () => {
    const l = porPedir({
      items: [vasos],
      faltantes: [{ id: "f1", ingrediente_id: "vasos", estado: "agotado", note: null }],
      solicitudes: [{ id: "s2", ingrediente_id: null, nombre: "Jabón de loza", qty: null, note: "el grande", requested_by_name: null, requested_at: "" }],
      enCamino: {},
    });
    expect(l.find((x) => x.key === "vasos")!.qty).toBe(50);
    expect(l.find((x) => x.key === "s2")).toMatchObject({ ingredienteId: null, nombre: "Jabón de loza", qty: 1, legible: null });
  });
  it("skips what is already on its way unless someone asked again", () => {
    expect(porPedir({ items: [cafe], ...vacio, enCamino: { cafe: 2500 } })).toEqual([]);
    const again = porPedir({ items: [cafe], faltantes: [], solicitudes: [{ id: "s", ingrediente_id: "cafe", nombre: null, qty: null, note: null, requested_by_name: null, requested_at: "" }], enCamino: { cafe: 2500 } });
    expect(again).toHaveLength(1);
  });
});

describe("order days", () => {
  it("tocaHoy / diasParaPedir / diasLegibles", () => {
    expect(tocaHoy([0, 3], 3)).toBe(true);
    expect(tocaHoy([0, 3], 4)).toBe(false);
    expect(tocaHoy([], 4)).toBe(true);
    expect(diasParaPedir([0, 3], 4)).toBe(3);
    expect(diasParaPedir([0, 3], 3)).toBe(0);
    expect(diasParaPedir([], 3)).toBeNull();
    expect(diasLegibles([3, 0])).toBe("lun · jue");
    expect(diasLegibles([])).toBe("cualquier día");
  });
  it("groups by supplier: due today first, no supplier last", () => {
    const lineas = porPedir({ items: [leche, cafe, item({ id: "x", name: "Sin dueño", stock: 0, stock_min: 5 }), item({ id: "v", name: "Vasos", stock: 0, stock_min: 5, proveedor_id: "p2" })], ...vacio });
    const g = agruparPorProveedor(lineas, [
      { id: "p1", name: "Lácteos", whatsapp: null, dias_pedido_idx: [3], entrega_dias: 1 },
      { id: "p2", name: "Plásticos", whatsapp: "573001112233", dias_pedido_idx: [0], entrega_dias: 2 },
    ], 0);
    expect(g.map((x) => x.proveedor?.name ?? null)).toEqual(["Plásticos", "Lácteos", null]);
    expect(g[0]).toMatchObject({ toca: true, faltan: 0 });
    expect(g[1]).toMatchObject({ toca: false, faltan: 3 });
    expect(g[1].lineas.map((l) => l.key)).toEqual(["cafe", "leche"]);
  });
});

describe("mensajePedido / waLink / fechaMas", () => {
  it("writes the order and the link", () => {
    const t = mensajePedido({ negocio: "PA'YO", folio: 7, lineas: [{ nombre: "Leche", cantidad: "12 bolsas" }], nota: "para mañana" });
    expect(t).toContain("pedido de PA'YO (n.º 7)");
    expect(t).toContain("• 12 bolsas — Leche");
    expect(t).toContain("para mañana");
    expect(waLink("57 300 111 2233", "hola ¿qué?")).toBe("https://wa.me/573001112233?text=hola%20%C2%BFqu%C3%A9%3F");
    expect(waLink(null, "x")).toBeNull();
  });
  it("adds calendar days", () => {
    expect(fechaMas("2026-10-30", 2)).toBe("2026-11-01");
  });
});
