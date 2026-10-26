import { describe, expect, it } from "vitest";
import { ajustar, buildPorPedirMovil, pasoDe, qtyLegible, totales, vistaMensaje } from "./por-pedir";
import type { LineaPedir, PedirItem, ProveedorPedido } from "./compras";

const TODAY = "2026-10-26";

const item = (id: string, name: string, extra: Partial<PedirItem> = {}): PedirItem => ({
  id,
  name,
  unit: "und",
  stock: 0,
  stock_critico: 0,
  stock_min: 0,
  stock_objetivo: null,
  pack_qty: null,
  pack_label: null,
  pieza_qty: null,
  proveedor_id: null,
  ...extra,
});

const linea = (key: string, nombre: string, proveedorId: string | null, motivos: LineaPedir["motivos"], qty = 1, notas: string[] = []): LineaPedir => ({
  key,
  ingredienteId: key.startsWith("sol") ? null : key,
  nombre,
  proveedorId,
  nivel: "rojo",
  stock: 0,
  qty,
  legible: null,
  motivos,
  solicitudIds: key.startsWith("sol") ? [key] : [],
  faltanteIds: [],
  notas,
});

const PROVS: ProveedorPedido[] = [
  { id: "p-alim", name: "Alimtec SAS", whatsapp: "573001112233", dias_pedido_idx: [], entrega_dias: 1 },
  { id: "p-mega", name: "Mega Plásticos", whatsapp: "573004445566", dias_pedido_idx: [], entrega_dias: 1 },
];

const ITEMS = [
  item("leche", "Leche entera", { unit: "ml", pack_label: "bolsa", pieza_qty: 900, proveedor_id: "p-alim" }),
  item("mora", "Pulpa de mora", { proveedor_id: "p-alim" }),
  item("vasos", "Vasos 12 oz", { pack_qty: 50, pack_label: "paquete", proveedor_id: "p-mega" }),
  item("tapas", "Tapas domo", { pack_qty: 50, pack_label: "paquete", proveedor_id: "p-mega" }),
  item("sal", "Sal", {}),
];

const build = () =>
  buildPorPedirMovil({
    lineas: [
      linea("leche", "Leche entera", "p-alim", ["faltante"], 900),
      linea("mora", "Pulpa de mora", "p-alim", ["faltante"], 1, ["quedan 2"]),
      linea("vasos", "Vasos 12 oz", "p-mega", ["nivel", "faltante"], 50),
      linea("tapas", "Tapas domo", "p-mega", ["faltante"], 50),
      // Only the system's level: not on the phone list.
      linea("sal", "Sal", null, ["nivel"], 1),
      linea("sol-1", "Servilletas grandes", null, ["solicitud"], 2),
    ],
    items: ITEMS,
    faltantes: [
      { ingrediente_id: "leche", estado: "bajo", reported_at: "2026-10-26T15:41:00Z", reported_by_name: "Andrés", note: null },
      { ingrediente_id: "mora", estado: "bajo", reported_at: "2026-10-26T13:40:00Z", reported_by_name: "Camila", note: "quedan 2" },
      { ingrediente_id: "vasos", estado: "bajo", reported_at: "2026-10-26T14:00:00Z", reported_by_name: "Camila", note: null },
      // Agotado wins over a newer poco of the same item.
      { ingrediente_id: "vasos", estado: "agotado", reported_at: "2026-10-26T14:58:00Z", reported_by_name: "Camila", note: null },
      { ingrediente_id: "tapas", estado: "bajo", reported_at: "2026-10-26T14:58:00Z", reported_by_name: "Camila", note: null },
    ],
    proveedores: PROVS,
    today: TODAY,
  });

describe("buildPorPedirMovil", () => {
  it("keeps only what the team marked or asked for, by supplier, agotado suppliers first and «Sin proveedor» last", () => {
    const g = build();
    expect(g.map((x) => x.nombre)).toEqual(["Mega Plásticos", "Alimtec SAS", "Sin proveedor"]);
    expect(g.flatMap((x) => x.lineas.map((l) => l.key))).not.toContain("sal");
    expect(g[0]).toMatchObject({ proveedorId: "p-mega", whatsapp: "573004445566", agotados: 1 });
  });
  it("puts agotado first inside a supplier and says who marked it, when, and the note once", () => {
    const [mega, alim, sueltos] = build();
    expect(mega.lineas.map((l) => `${l.nombre}:${l.marca}`)).toEqual(["Vasos 12 oz:agotado", "Tapas domo:poco"]);
    expect(mega.lineas[0].meta).toBe("Camila · 9:58");
    expect(alim.lineas.find((l) => l.key === "mora")!.meta).toBe("Camila · 8:40 · “quedan 2”");
    expect(sueltos.lineas[0]).toMatchObject({ nombre: "Servilletas grandes", marca: "poco", meta: "lo pidió el equipo", qty: 2, ingredienteId: null });
  });
  it("suggests at least one lot", () => {
    const mega = build()[0];
    expect(mega.lineas[0]).toMatchObject({ qty: 50, paso: 50 });
    const leche = build()[1].lineas.find((l) => l.key === "leche")!;
    expect(leche).toMatchObject({ qty: 900, paso: 900 });
  });
});

describe("quantities", () => {
  it("steps one lot at a time and never below one lot", () => {
    expect(pasoDe({ pack_qty: 50, pieza_qty: null })).toBe(50);
    expect(pasoDe({ pack_qty: null, pieza_qty: 900 })).toBe(900);
    expect(pasoDe(undefined)).toBe(1);
    expect(ajustar(900, 900, 1)).toBe(1800);
    expect(ajustar(900, 900, -1)).toBe(900);
    expect(ajustar(0.3, 0.1, 1)).toBe(0.4);
  });
  it("says the quantity in the supplier's terms", () => {
    expect(qtyLegible(1800, { unit: "ml", pack_label: "bolsa", pieza_qty: 900, stock_critico: 0, stock_min: 0, stock_objetivo: null, pack_qty: null })).toBe("2 bolsas");
    expect(qtyLegible(3, undefined)).toBe("3 und");
  });
});

describe("message and totals", () => {
  it("previews the WhatsApp without a folio", () => {
    const m = vistaMensaje("PAYO", [{ nombre: "Leche entera", cantidad: "2 bolsas" }]);
    expect(m.startsWith("Hola, pedido de PAYO:")).toBe(true);
    expect(m).toContain("• 2 bolsas — Leche entera");
    expect(m).not.toContain("n.º");
  });
  it("counts lines plus new items, and agotados including new ones marked agotado", () => {
    expect(totales(build(), [{ estado: "agotado" }, { estado: null }])).toEqual({ total: 7, agotados: 2 });
  });
});
