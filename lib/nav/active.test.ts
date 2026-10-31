import { describe, expect, it } from "vitest";
import { activeItemIn, activeSectionFor, activeTabFor, underPrefix } from "./active";
import { AVANZADO_ITEMS, DUENO_TABS, EQUIPO_TABS, MAS_ITEMS, MAS_MATCH } from "./items";

const dueno = (p: string) => activeTabFor(p, DUENO_TABS, { mas: MAS_MATCH })?.id ?? null;
const equipo = (p: string) => activeTabFor(p, EQUIPO_TABS)?.id ?? null;

describe("underPrefix", () => {
  it("matches the segment boundary only", () => {
    expect(underPrefix("/caja", "/caja")).toBe(true);
    expect(underPrefix("/caja/x", "/caja")).toBe(true);
    expect(underPrefix("/cajas", "/caja")).toBe(false);
    expect(underPrefix("/", "/")).toBe(true);
    expect(underPrefix("/hoy", "/")).toBe(false);
  });
});

describe("activeTabFor · dueño", () => {
  it("maps current and future routes to the five tabs", () => {
    expect(dueno("/hoy")).toBe("hoy");
    expect(dueno("/hoy/2026-10-31")).toBe("hoy");
    expect(dueno("/numeros/2026-10-30")).toBe("hoy");
    expect(dueno("/inventario/kardex/abc")).toBe("inventario");
    expect(dueno("/historial")).toBe("inventario");
    expect(dueno("/compras")).toBe("inventario");
    expect(dueno("/catalogo")).toBe("productos");
    expect(dueno("/recetas")).toBe("productos");
    expect(dueno("/productos/123")).toBe("productos");
    expect(dueno("/turnos/asignacion")).toBe("equipo");
    expect(dueno("/equipo/horario")).toBe("equipo");
    expect(dueno("/equipo")).toBe("equipo");
    expect(dueno("/inventario/movimientos")).toBe("inventario");
    expect(dueno("/inventario/pedidos")).toBe("inventario");
  });

  it("points every tab and section at a new route", () => {
    const OLD = ["/catalogo", "/recetas", "/numeros", "/turnos", "/configuracion", "/calificaciones", "/baristas", "/historial", "/compras", "/inventario/faltantes"];
    const hrefs = [...DUENO_TABS, ...MAS_ITEMS].flatMap((t) => [t.href, ...(t.sections ?? []).map((s) => s.href)]);
    for (const h of hrefs) for (const o of OLD) expect(h === o || h.startsWith(o + "/"), h).toBe(false);
  });

  it("gives the most specific prefix priority", () => {
    expect(dueno("/configuracion/equipo")).toBe("equipo");
    expect(dueno("/configuracion/sede")).toBe("mas");
    expect(dueno("/configuracion")).toBe("mas");
  });

  it("sends «Más» pages to the Más tab", () => {
    for (const p of ["/mas", "/caja", "/gastos", "/clientes", "/clientes/puntos", "/ajustes/sede", "/calificaciones", "/baristas", "/combos", "/precios", "/importacion"]) {
      expect(dueno(p)).toBe("mas");
    }
  });

  it("returns null outside the panel", () => {
    expect(dueno("/pos")).toBeNull();
    expect(dueno("/menu")).toBeNull();
  });
});

describe("activeTabFor · equipo", () => {
  it("keeps Hoy exact so sub-pages win", () => {
    expect(equipo("/turno")).toBe("hoy");
    expect(equipo("/turno/tareas")).toBe("tareas");
    expect(equipo("/turno/caja/movimientos")).toBe("caja");
    expect(equipo("/turno/conteo")).toBe("inventario");
    expect(equipo("/turno/inventario/recibir")).toBe("inventario");
    expect(equipo("/pos")).toBe("pos");
    expect(equipo("/turno/abrir")).toBeNull();
  });
});

describe("sections", () => {
  it("finds the active section, exact-only for the tab root", () => {
    const inv = DUENO_TABS.find((t) => t.id === "inventario")!.sections!;
    expect(activeSectionFor("/inventario", inv)?.label).toBe("Existencias");
    expect(activeSectionFor("/inventario/conteos/1", inv)?.label).toBe("Conteos");
    expect(activeSectionFor("/inventario/kardex/1", inv)?.label).toBe("Movimientos");
    expect(activeSectionFor("/inventario/movimientos", inv)?.label).toBe("Movimientos");
    expect(activeSectionFor("/inventario/pedidos", inv)?.label).toBe("Pedidos");
    expect(activeSectionFor("/inventario/0b5c", inv)?.label).toBe("Existencias");
  });

  it("activates a query section only when its query matches", () => {
    const inv = DUENO_TABS.find((t) => t.id === "inventario")!.sections!;
    expect(activeSectionFor("/inventario", inv, "vista=acabando")?.label).toBe("Faltantes");
    expect(activeSectionFor("/inventario", inv, "vista=otra")?.label).toBe("Existencias");
    expect(activeSectionFor("/inventario", inv, "")?.label).toBe("Existencias");
  });

  it("keeps Personas exact under /equipo", () => {
    const eq = DUENO_TABS.find((t) => t.id === "equipo")!.sections!;
    expect(activeSectionFor("/equipo", eq)?.label).toBe("Personas");
    expect(activeSectionFor("/equipo/turnos/nuevo", eq)?.label).toBe("Turnos");
    expect(activeSectionFor("/equipo/horario", eq)?.label).toBe("Horario");
  });

  it("finds the Más entry that owns a page", () => {
    expect(activeItemIn("/configuracion/pos", MAS_ITEMS, AVANZADO_ITEMS)?.id).toBe("ajustes");
    expect(activeItemIn("/baristas", MAS_ITEMS, AVANZADO_ITEMS)?.id).toBe("clientes");
    expect(activeItemIn("/ajustes/dispositivos", MAS_ITEMS, AVANZADO_ITEMS)?.id).toBe("ajustes");
    expect(activeItemIn("/clientes/puntos", MAS_ITEMS, AVANZADO_ITEMS)?.id).toBe("clientes");
  });
});
