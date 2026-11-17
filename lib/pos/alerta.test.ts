import { describe, expect, it } from "vitest";
import { pedidosNuevos, recordatoriosVencidos } from "./alerta";

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
