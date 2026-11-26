import { describe, expect, it } from "vitest";
import { conversacionesNuevas, dentroDePantalla, pedidosNuevos, recordatorioTareas, recordatoriosVencidos } from "./alerta";

const ahora = Date.parse("2026-11-10T15:00:00Z");
const o = (id: string, canal: "pos" | "whatsapp", haceMin: number) => ({ id, canal, createdAt: new Date(ahora - haceMin * 60_000).toISOString() });

describe("pedidosNuevos", () => {
  it("first load rings only for WhatsApp orders that just arrived", () => {
    expect(pedidosNuevos(null, [o("a", "whatsapp", 30), o("b", "whatsapp", 1), o("c", "pos", 0)], ahora)).toEqual(["b"]);
  });
  it("rings for WhatsApp orders not seen before, never for station orders", () => {
    const vistos = new Set(["a"]);
    expect(pedidosNuevos(vistos, [o("a", "whatsapp", 30), o("d", "whatsapp", 40), o("e", "pos", 0)], ahora)).toEqual(["d"]);
  });
  it("nothing new, no ring", () => {
    expect(pedidosNuevos(new Set(["a"]), [o("a", "whatsapp", 0)], ahora)).toEqual([]);
  });
});

describe("recordatoriosVencidos", () => {
  const t0 = Date.parse("2026-11-17T10:00:00-05:00");
  const pedidos = [{ id: "a", createdAt: new Date(t0).toISOString() }];
  it("rings again every 5 minutes, once per round", () => {
    const avisados = new Map<string, number>();
    expect(recordatoriosVencidos(pedidos, avisados, t0 + 4 * 60_000)).toEqual([]);
    expect(recordatoriosVencidos(pedidos, avisados, t0 + 5 * 60_000)).toEqual(["a"]);
    expect(recordatoriosVencidos(pedidos, avisados, t0 + 7 * 60_000)).toEqual([]);
    expect(recordatoriosVencidos(pedidos, avisados, t0 + 10 * 60_000 + 1)).toEqual(["a"]);
  });
  it("forgets orders that were accepted or turned down", () => {
    const avisados = new Map([["a", 2]]);
    recordatoriosVencidos([], avisados, t0 + 11 * 60_000);
    expect(avisados.size).toBe(0);
  });
});

describe("conversacionesNuevas", () => {
  it("chimes once per new customer message", () => {
    const vistas = new Map<string, string>();
    expect(conversacionesNuevas(vistas, [{ id: "a", ultimo: "2026-11-17T15:00:00Z" }])).toEqual(["a"]);
    expect(conversacionesNuevas(vistas, [{ id: "a", ultimo: "2026-11-17T15:00:00Z" }])).toEqual([]);
    expect(conversacionesNuevas(vistas, [{ id: "a", ultimo: "2026-11-17T15:01:00Z" }, { id: "b", ultimo: "2026-11-17T15:01:00Z" }])).toEqual(["a", "b"]);
  });
});

describe("recordatorioTareas", () => {
  const MIN = 60_000;
  const nuevo = () => ({ sonadas: new Set<string>(), ultimo: 0 });

  it("stays quiet until a task is past the grace period", () => {
    const e = nuevo();
    expect(recordatorioTareas([{ id: "a", tarde: 4 }], e, 10 * MIN)).toBe(false);
    expect(recordatorioTareas([{ id: "a", tarde: 5 }], e, 11 * MIN)).toBe(true);
  });

  it("rings once for several late tasks, then every 10 minutes", () => {
    const e = nuevo();
    const late = [{ id: "a", tarde: 8 }, { id: "b", tarde: 6 }];
    expect(recordatorioTareas(late, e, 100 * MIN)).toBe(true);
    expect(recordatorioTareas(late, e, 101 * MIN)).toBe(false);
    expect(recordatorioTareas(late, e, 109 * MIN)).toBe(false);
    expect(recordatorioTareas(late, e, 110 * MIN)).toBe(true);
  });

  it("rings at once when another task turns late", () => {
    const e = nuevo();
    expect(recordatorioTareas([{ id: "a", tarde: 6 }], e, 100 * MIN)).toBe(true);
    expect(recordatorioTareas([{ id: "a", tarde: 8 }, { id: "b", tarde: 5 }], e, 102 * MIN)).toBe(true);
  });

  it("goes quiet once the tasks are done, and forgets them", () => {
    const e = nuevo();
    recordatorioTareas([{ id: "a", tarde: 6 }], e, 100 * MIN);
    expect(recordatorioTareas([], e, 120 * MIN)).toBe(false);
    expect(e.sonadas.size).toBe(0);
  });
});

describe("dentroDePantalla", () => {
  const caja = { w: 300, h: 60 };
  const pantalla = { w: 1280, h: 800 };
  it("keeps a position that already fits", () => {
    expect(dentroDePantalla({ x: 100, y: 200 }, caja, pantalla)).toEqual({ x: 100, y: 200 });
  });
  it("pulls a reminder dragged past an edge back on screen", () => {
    expect(dentroDePantalla({ x: -50, y: 900 }, caja, pantalla)).toEqual({ x: 8, y: 732 });
    expect(dentroDePantalla({ x: 1200, y: -10 }, caja, pantalla)).toEqual({ x: 972, y: 8 });
  });
});
