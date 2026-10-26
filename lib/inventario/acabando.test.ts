import { describe, expect, it } from "vitest";
import {
  armarVista,
  buildInsumos,
  conPendientes,
  contar,
  cuando,
  encolar,
  horaLocal,
  llegaLabel,
  marcaDe,
  metaInsumo,
  parecidosA,
  presentacion,
  rail,
  zonaDe,
  type InsumoBase,
} from "./acabando";

const TODAY = "2026-10-26"; // a Monday

const base = (id: string, name: string, ubicacion: string | null, extra: Partial<InsumoBase> = {}): InsumoBase => ({
  id,
  name,
  unit: "und",
  ubicacion,
  pack_label: null,
  pieza_qty: null,
  ...extra,
});

const ITEMS: InsumoBase[] = [
  base("cafe", "Café en grano", "Barra", { unit: "g", pack_label: "bolsa", pieza_qty: 2500 }),
  base("vasos", "Vasos 12 oz fríos", "Barra", { pack_label: "paquete" }),
  base("pitillos", "Pitillos", "Barra"),
  base("leche", "Leche entera", "Nevera", { unit: "ml", pack_label: "bolsa", pieza_qty: 900 }),
  base("mora", "Pulpa de mora", "nevera"),
  base("jabon", "Jabón para loza", null),
];

const build = () =>
  buildInsumos({
    items: ITEMS,
    abiertos: [
      { ingrediente_id: "cafe", estado: "bajo", reported_at: "2026-10-26T15:32:00Z", reported_by_name: "Andrés", note: "queda media bolsa" },
      { ingrediente_id: "vasos", estado: "agotado", reported_at: "2026-10-26T14:58:00Z", reported_by_name: "Camila", note: null },
      // An older report of the same item loses to the newest.
      { ingrediente_id: "vasos", estado: "bajo", reported_at: "2026-10-25T14:58:00Z", reported_by_name: "Camila", note: null },
      { ingrediente_id: "pitillos", estado: "bajo", reported_at: "2026-10-25T20:00:00Z", reported_by_name: "Camila", note: null },
    ],
    camino: [
      { ingrediente_id: "pitillos", proveedor: "Mega Plásticos", entrega_esperada: "2026-10-29" },
      { ingrediente_id: "pitillos", proveedor: "Otro", entrega_esperada: "2026-11-10" },
    ],
    nuevos: [{ id: "s1", nombre: "Leche de coco", zona: "Nevera", estado: "agotado", nota: "la de lata", by: "Andrés", at: "2026-10-26T15:44:00Z" }],
    today: TODAY,
  });

describe("zonaDe / presentacion / marcaDe", () => {
  it("matches the walked zones case-insensitively and files the rest under Otros", () => {
    expect(zonaDe("Barra")).toBe("Barra");
    expect(zonaDe(" nevera ")).toBe("Nevera");
    expect(zonaDe(null)).toBe("Otros");
    expect(zonaDe("Caja")).toBe("Otros");
  });
  it("says how the item sits on the shelf", () => {
    expect(presentacion({ unit: "ml", pack_label: "bolsa", pieza_qty: 900 })).toBe("bolsa 900 ml");
    expect(presentacion({ unit: "g", pack_label: "bolsa", pieza_qty: 2.5 })).toBe("bolsa 2,5 g");
    expect(presentacion({ unit: "und", pack_label: "paquete", pieza_qty: null })).toBe("paquete");
    expect(presentacion({ unit: "und", pack_label: null, pieza_qty: null })).toBe("und");
  });
  it("maps the DB states to the buttons", () => {
    expect(marcaDe("ok")).toBe("hay");
    expect(marcaDe("bajo")).toBe("poco");
    expect(marcaDe("agotado")).toBe("agotado");
    expect(marcaDe(null)).toBe("hay");
  });
});

describe("dates without Intl", () => {
  it("formats Bogotá's wall clock deterministically", () => {
    expect(horaLocal("2026-10-26T15:41:00Z")).toEqual({ fecha: "2026-10-26", hora: "10:41" });
    expect(horaLocal("2026-10-26T03:05:00Z")).toEqual({ fecha: "2026-10-25", hora: "22:05" });
  });
  it("says today's time, ayer, or the date", () => {
    expect(cuando("2026-10-26T15:41:00Z", TODAY)).toBe("10:41");
    expect(cuando("2026-10-25T15:41:00Z", TODAY)).toBe("ayer");
    expect(cuando("2026-10-20T15:41:00Z", TODAY)).toBe("20 oct");
    expect(cuando(null, TODAY)).toBe("");
  });
  it("says when an order arrives", () => {
    expect(llegaLabel("2026-10-26", TODAY)).toBe("llega hoy");
    expect(llegaLabel("2026-10-27", TODAY)).toBe("llega mañana");
    expect(llegaLabel("2026-10-29", TODAY)).toBe("llega jueves");
    expect(llegaLabel("2026-11-03", TODAY)).toBe("llega el 3 nov");
    expect(llegaLabel("2026-10-24", TODAY)).toBe("ya debía llegar");
    expect(llegaLabel(null, TODAY)).toBe("pedido");
  });
});

describe("buildInsumos", () => {
  it("lays the newest open report and the soonest order over each item", () => {
    const rows = build();
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(by.cafe).toMatchObject({ marca: "poco", by: "Andrés", note: "queda media bolsa", pack: "bolsa 2500 g", zona: "Barra" });
    expect(by.vasos.marca).toBe("agotado");
    expect(by.pitillos.pedido).toBe("llega jueves");
    expect(by.leche).toMatchObject({ marca: "hay", by: null, pedido: null });
    expect(by.mora.zona).toBe("Nevera");
    expect(by.jabon.zona).toBe("Otros");
  });
  it("adds what the team proposed as new, in its zone, with nothing to tap", () => {
    const n = build().find((r) => r.nuevo)!;
    expect(n).toMatchObject({ id: "nuevo:s1", name: "Leche de coco", zona: "Nevera", marca: "agotado", nuevo: true });
  });
});

describe("contar / rail", () => {
  it("counts what is short apart from what is on its way", () => {
    expect(contar(build())).toEqual({ poco: 1, agotado: 2, camino: 1 });
  });
  it("lists «Lo marcado» first and only the zones that have items", () => {
    const r = rail(build());
    expect(r.map((e) => e.vista)).toEqual(["marcado", "Barra", "Nevera", "Otros"]);
    expect(r[0]).toMatchObject({ flags: 3, urgente: true, sub: "todas las zonas" });
    expect(r[1]).toMatchObject({ flags: 2, urgente: true, sub: "3 insumos" });
    // The new item in Nevera is agotado.
    expect(r[2]).toMatchObject({ flags: 1, urgente: true });
    expect(r[3]).toMatchObject({ flags: 0, urgente: false, sub: "1 insumo" });
  });
});

describe("armarVista", () => {
  it("shows a zone's marked items first (agotado, poco, en camino) and the rest A–Z", () => {
    const v = armarVista(build(), "Barra", "");
    expect(v.titulo).toBe("Barra");
    expect(v.sub).toBe("3 insumos · 2 marcados");
    expect(v.secciones.map((s) => s.label)).toEqual(["MARCADOS Y EN CAMINO"]);
    expect(v.secciones[0].items.map((i) => i.id)).toEqual(["vasos", "cafe", "pitillos"]);
    const nevera = armarVista(build(), "Nevera", "");
    expect(nevera.secciones.map((s) => s.items.map((i) => i.name))).toEqual([["Leche de coco"], ["Leche entera", "Pulpa de mora"]]);
  });
  it("«Lo marcado» is what to order, agotado first, then what is on its way", () => {
    const v = armarVista(build(), "marcado", "");
    expect(v.secciones.map((s) => s.label)).toEqual(["POR PEDIR · AGOTADO PRIMERO", "EN CAMINO"]);
    expect(v.secciones[0].items.map((i) => i.name)).toEqual(["Leche de coco", "Vasos 12 oz fríos", "Café en grano"]);
    expect(v.secciones[1].items.map((i) => i.name)).toEqual(["Pitillos"]);
    expect(v.todoEnOrden).toBe(false);
    expect(v.sub).toBe("3 por pedir en las 3 zonas");
  });
  it("is «todo en orden» when nothing is marked", () => {
    const rows = build().map((r) => ({ ...r, marca: "hay" as const }));
    expect(armarVista(rows, "marcado", "").todoEnOrden).toBe(true);
  });
  it("searches every zone ignoring accents and case", () => {
    const v = armarVista(build(), "Barra", "  JABON ");
    expect(v.titulo).toBe("Resultados");
    expect(v.secciones[0].items.map((i) => i.id)).toEqual(["jabon"]);
    expect(v.secciones[0].conZona).toBe(true);
    expect(v.secciones[0].label).toBe("COINCIDEN CON «JABON»");
    const none = armarVista(build(), "Barra", "leche de almendras");
    expect(none.sinResultados).toBe(true);
    expect(none.secciones).toEqual([]);
  });
});

describe("metaInsumo", () => {
  const rows = build();
  const get = (id: string) => rows.find((r) => r.id === id)!;
  it("says who marked it and when, with the note", () => {
    expect(metaInsumo(get("cafe"), TODAY)).toBe("Poco · Andrés · 10:32 · “queda media bolsa”");
    expect(metaInsumo(get("leche"), TODAY)).toBe("bolsa 900 ml");
  });
  it("says it is ordered, and that it ran out anyway", () => {
    expect(metaInsumo(get("pitillos"), TODAY)).toBe("Pedido · llega jueves");
    expect(metaInsumo({ ...get("pitillos"), marca: "agotado" }, TODAY)).toBe("Pedido · llega jueves · ya se agotó");
  });
  it("confirms a save, marks what is waiting for the internet, and prefixes the zone when mixed", () => {
    expect(metaInsumo(get("cafe"), TODAY, { guardado: true })).toBe("Guardado ✓ · Poco · Andrés · ahora");
    expect(metaInsumo({ ...get("cafe"), by: null }, TODAY, { guardado: true })).toBe("Guardado ✓ · Poco · ahora");
    expect(metaInsumo(get("vasos"), TODAY, { enEspera: true })).toBe("Agotado · Camila · 9:58 · en espera");
    expect(metaInsumo(get("vasos"), TODAY, { conZona: true })).toBe("Barra · Agotado · Camila · 9:58");
    expect(metaInsumo(rows.find((r) => r.nuevo)!, TODAY)).toBe("Nuevo · Agotado · Andrés · 10:44 · “la de lata”");
  });
});

describe("offline queue", () => {
  it("keeps only the last tap per item and lays the queue over the list", () => {
    let cola = encolar([], { ingredienteId: "leche", marca: "poco", note: null, at: "2026-10-26T15:52:00Z", by: "Andrés" });
    cola = encolar(cola, { ingredienteId: "jabon", marca: "agotado", note: null, at: "2026-10-26T15:53:00Z", by: "Andrés" });
    cola = encolar(cola, { ingredienteId: "leche", marca: "agotado", note: "nada", at: "2026-10-26T15:54:00Z", by: "Andrés" });
    expect(cola.map((p) => `${p.ingredienteId}:${p.marca}`)).toEqual(["jabon:agotado", "leche:agotado"]);
    const rows = conPendientes(build(), cola);
    expect(rows.find((r) => r.id === "leche")).toMatchObject({ marca: "agotado", note: "nada", by: "Andrés" });
    expect(contar(rows)).toEqual({ poco: 1, agotado: 4, camino: 1 });
  });
});

describe("parecidosA", () => {
  it("offers items of the list with a word in common, never the new ones", () => {
    expect(parecidosA("leche de coco", build()).map((r) => r.id)).toEqual(["leche"]);
    expect(parecidosA("de", build())).toEqual([]);
  });
});
