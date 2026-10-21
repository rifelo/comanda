import { describe, expect, it } from "vitest";
import { parsePeriodo, rangoPeriodo, resumenBaristas, type OrdenBarista } from "./baristas";

describe("rangoPeriodo", () => {
  it("today, the week from Monday and the month from the 1st", () => {
    expect(rangoPeriodo("hoy", "2026-10-21")).toEqual({ desde: "2026-10-21", hasta: "2026-10-21" });
    expect(rangoPeriodo("semana", "2026-10-21")).toEqual({ desde: "2026-10-19", hasta: "2026-10-21" }); // Wednesday
    expect(rangoPeriodo("semana", "2026-10-19")).toEqual({ desde: "2026-10-19", hasta: "2026-10-19" }); // Monday
    expect(rangoPeriodo("semana", "2026-10-25")).toEqual({ desde: "2026-10-19", hasta: "2026-10-25" }); // Sunday
    expect(rangoPeriodo("mes", "2026-10-21")).toEqual({ desde: "2026-10-01", hasta: "2026-10-21" });
  });
  it("defaults to the week", () => {
    expect(parsePeriodo(undefined)).toBe("semana");
    expect(parsePeriodo("año")).toBe("semana");
    expect(parsePeriodo("mes")).toBe("mes");
  });
});

describe("resumenBaristas", () => {
  const bebidas = new Set(["latte", "tinto", "jugo"]);
  const esBebida = (id: string) => bebidas.has(id);
  const combo = (id: string) => (id === "desayuno" ? 1 : 0);
  const nombres: Record<string, string> = { a: "Andrés", p: "Pipe" };
  const o = (id: string, baristaId: string | null, items: [string, number][]): OrdenBarista => ({
    id,
    baristaId,
    items: items.map(([p, qty]) => (p.startsWith("combo:") ? { productoId: null, comboId: p.slice(6), qty } : { productoId: p, comboId: null, qty })),
  });

  it("counts drinks per barista, not cakes, and combos by the drinks inside", () => {
    const r = resumenBaristas(
      [o("1", "a", [["latte", 2], ["torta", 1]]), o("2", "a", [["tinto", 1]]), o("3", "p", [["jugo", 1], ["combo:desayuno", 2]]), o("4", "p", [["torta", 3]])],
      esBebida, combo, [], (id) => nombres[id],
    );
    expect(r.map((f) => [f.name, f.bebidas, f.pedidos])).toEqual([["Andrés", 3, 2], ["Pipe", 3, 1]]);
  });

  it("credits each rating to the barista of its order and averages the stars", () => {
    const r = resumenBaristas(
      [o("1", "a", [["latte", 1]]), o("2", "a", [["latte", 1]]), o("3", "p", [["tinto", 1]])],
      esBebida, combo,
      [{ ordenId: "1", estrellas: 5 }, { ordenId: "2", estrellas: 3 }, { ordenId: "3", estrellas: 4 }, { ordenId: "x", estrellas: 1 }],
      (id) => nombres[id],
    );
    const a = r.find((f) => f.id === "a")!;
    expect(a.calificadas).toBe(2);
    expect(a.promedio).toBe(4);
    expect(a.estrellas).toEqual([0, 0, 1, 0, 1]);
    expect(r.find((f) => f.id === "p")!.promedio).toBe(4);
  });

  it("keeps uncredited orders in «Sin barista», last", () => {
    const r = resumenBaristas([o("1", null, [["latte", 5]]), o("2", "p", [["latte", 1]])], esBebida, combo, [{ ordenId: "1", estrellas: 2 }], (id) => nombres[id]);
    expect(r.map((f) => f.name)).toEqual(["Pipe", "Sin barista"]);
    expect(r[1]).toMatchObject({ id: null, bebidas: 5, calificadas: 1, promedio: 2 });
  });
});
