import { describe, expect, it } from "vitest";
import { deltaPct, etiquetaComparacion, fechaLarga, metaDelPeriodo, resumirVentas, ventanaVentas, type VentaOrden } from "./ventas";

// Sunday 1 Nov 2026, 16:20 Bogotá = 21:20Z
const NOW = Date.parse("2026-11-01T21:20:00Z");

let n = 0;
function orden(p: Partial<VentaOrden> & { at: string }): VentaOrden {
  return {
    id: `o${++n}`,
    status: "pagada",
    total: 10_000,
    createdAt: new Date(Date.parse(`2026-11-01T${p.at}:00-05:00`)).toISOString(),
    method: "efectivo",
    merged: false,
    createdBy: "pipe",
    items: [{ key: "tinto", name: "Tinto", qty: 1 }],
    pagos: [],
    ...p,
  };
}

describe("ventanaVentas", () => {
  it("hoy runs from Bogotá midnight to now, compared with the same hour a week ago", () => {
    const w = ventanaVentas("hoy", NOW);
    expect(new Date(w.desde).toISOString()).toBe("2026-11-01T05:00:00.000Z");
    expect(w.hasta).toBe(NOW);
    expect(new Date(w.antes.hasta).toISOString()).toBe("2026-10-25T21:20:00.000Z");
  });
  it("ayer is the whole previous day", () => {
    const w = ventanaVentas("ayer", NOW);
    expect(new Date(w.desde).toISOString()).toBe("2026-10-31T05:00:00.000Z");
    expect(new Date(w.hasta).toISOString()).toBe("2026-11-01T05:00:00.000Z");
  });
  it("esta semana starts on Monday (Sunday belongs to the week that began on Monday)", () => {
    const w = ventanaVentas("semana", NOW);
    expect(new Date(w.desde).toISOString()).toBe("2026-10-26T05:00:00.000Z");
  });
});

describe("resumirVentas", () => {
  const ordenes: VentaOrden[] = [
    orden({ at: "09:10", total: 20_000, items: [{ key: "tinto", name: "Tinto", qty: 2 }, { key: "alfajor", name: "Alfajor", qty: 1 }] }),
    orden({ at: "09:40", total: 8_000, method: "transferencia", createdBy: "andres", items: [{ key: "latte", name: "Latte", qty: 1 }] }),
    orden({ at: "10:05", total: 12_000, method: "mixto", pagos: [{ method: "efectivo", amount: 5_000 }, { method: "tarjeta", amount: 7_000 }] }),
    orden({ at: "11:00", status: "pendiente", total: 7_000 }),
    orden({ at: "11:30", status: "cancelada" }),
    orden({ at: "12:00", status: "cancelada", merged: true }),
    orden({ at: "06:20", total: 3_000 }),
  ];
  const r = resumirVentas(ordenes, { periodo: "hoy", now: NOW });

  it("counts paid sales; combined orders are not cancellations", () => {
    expect(r.vendido).toBe(43_000);
    expect(r.pagadas).toBe(4);
    expect(r.pedidos).toBe(5);
    expect(r.sinPagar).toBe(1);
    expect(r.cancelados).toBe(1);
    expect(r.ticket).toBe(10_750);
    expect(r.itemsPorPedido).toBeCloseTo(6 / 4);
  });
  it("buckets by Bogotá hour, widening 7–20 to an earlier sale", () => {
    expect(r.horas[0].hora).toBe(6);
    expect(r.horas.at(-1)!.hora).toBe(20);
    expect(r.horas.find((h) => h.hora === 9)).toEqual({ hora: 9, total: 28_000, pedidos: 2 });
    expect(r.horaActual).toBe(16);
  });
  it("ranks products by units", () => {
    expect(r.productos[0]).toEqual({ key: "tinto", name: "Tinto", qty: 4 });
  });
  it("splits payments by row, falling back to the order's method; tarjeta = datáfono", () => {
    const by = Object.fromEntries(r.pagos.map((p) => [p.method, p]));
    expect(by.efectivo).toEqual({ method: "efectivo", count: 3, amount: 28_000 });
    expect(by.transferencia).toEqual({ method: "transferencia", count: 1, amount: 8_000 });
    expect(by.datafono).toEqual({ method: "datafono", count: 1, amount: 7_000 });
  });
  it("groups by the person in session, biggest first", () => {
    expect(r.personas.map((p) => [p.id, p.pedidos, p.total])).toEqual([["pipe", 3, 35_000], ["andres", 1, 8_000]]);
  });
  it("yesterday has no current hour", () => {
    expect(resumirVentas([], { periodo: "ayer", now: NOW }).horaActual).toBeNull();
  });
});

describe("labels and goal", () => {
  it("words the comparison", () => {
    expect(etiquetaComparacion("hoy", NOW)).toBe("el domingo pasado a esta hora");
    expect(etiquetaComparacion("ayer", NOW)).toBe("el sábado anterior");
    expect(fechaLarga(NOW)).toBe("Domingo 1 de noviembre");
  });
  it("delta and goal", () => {
    expect(deltaPct(112, 100)).toBe(12);
    expect(deltaPct(5, 0)).toBeNull();
    expect(metaDelPeriodo(600_000, "semana")).toBe(4_200_000);
    expect(metaDelPeriodo(null, "hoy")).toBeNull();
  });
});
