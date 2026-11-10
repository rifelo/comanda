import { describe, expect, it } from "vitest";
import { pedidosNuevos } from "./alerta";

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
