import { describe, expect, it } from "vitest";
import { conMananaDoble, esMananaDoble, motivoNoAplica, premioPorId, progreso, PREMIOS } from "./premios";

describe("progreso", () => {
  it("apunta al primer premio y calcula lo que falta", () => {
    const p = progreso(13);
    expect(p.siguiente?.puntos).toBe(50);
    expect(p.faltan).toBe(37);
    expect(p.pct).toBe(26);
    expect(p.disponibles).toEqual([]);
  });
  it("con 71 ya tiene el clásico y va por el de 100", () => {
    const p = progreso(71);
    expect(p.disponibles.map((x) => x.id)).toEqual(["clasico"]);
    expect(p.siguiente?.id).toBe("la-que-quieras");
    expect(p.faltan).toBe(29);
  });
  it("con 100 o más todo está disponible", () => {
    const p = progreso(130);
    expect(p.siguiente).toBeNull();
    expect(p.pct).toBe(100);
    expect(p.disponibles).toHaveLength(PREMIOS.length);
  });
  it("nunca es negativo", () => {
    expect(progreso(-5).faltan).toBe(50);
  });
});

describe("mañana doble (hora de Bogotá)", () => {
  it("antes de las 9:00 a. m. cuenta doble", () => {
    expect(esMananaDoble("2026-11-14T13:59:00Z")).toBe(true); // 8:59 Bogotá
    expect(conMananaDoble(12, "2026-11-14T11:30:00Z")).toBe(24); // 6:30
  });
  it("desde las 9:00 a. m. cuenta normal", () => {
    expect(esMananaDoble("2026-11-14T14:00:00Z")).toBe(false); // 9:00
    expect(conMananaDoble(12, "2026-11-14T20:00:00Z")).toBe(12); // 3 p. m.
  });
});

describe("motivoNoAplica", () => {
  const clasico = premioPorId("clasico")!;
  const todas = premioPorId("la-que-quieras")!;
  it("el clásico es hasta $4.000", () => {
    expect(motivoNoAplica(clasico, { price: 3000, printsLabel: true }, 1)).toBeNull();
    expect(motivoNoAplica(clasico, { price: 8000, printsLabel: true }, 1)).toMatch(/hasta \$4\.000/);
  });
  it("«la que quieras» acepta cualquier bebida preparada", () => {
    expect(motivoNoAplica(todas, { price: 12000, printsLabel: true }, 1)).toBeNull();
  });
  it("no aplica a comida ni a botellas", () => {
    expect(motivoNoAplica(todas, { price: 7000, printsLabel: false }, 1)).toMatch(/bebida preparada/);
  });
  it("pide una sola unidad de esa bebida en el pedido", () => {
    expect(motivoNoAplica(todas, { price: 8000, printsLabel: true }, 2)).toMatch(/solo una/);
  });
});
