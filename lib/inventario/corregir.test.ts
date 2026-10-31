import { describe, it, expect } from "vitest";
import { cantidadDesdeTeclado, planCorreccion, tecladoDesdeCantidad, valorCambio } from "./corregir";

const base = { actual: 10, costoUnit: 100 };

describe("planCorreccion", () => {
  it("«Conté» is an ajuste noted «Conteo» with the signed delta", () => {
    const r = planCorreccion({ ...base, nuevo: 7, motivo: "conte" });
    expect(r).toEqual({ ok: true, plan: { type: "ajuste", delta: -3, unitCost: 100, note: "Conteo", recostear: null } });
    const up = planCorreccion({ ...base, nuevo: 12.5, motivo: "conte" });
    expect(up.ok && up.plan.delta).toBe(2.5);
  });

  it("«Se dañó / venció» is a merma and only goes down", () => {
    const r = planCorreccion({ ...base, nuevo: 4, motivo: "danado" });
    expect(r.ok && r.plan).toMatchObject({ type: "merma", delta: -6, unitCost: 100 });
    expect(planCorreccion({ ...base, nuevo: 11, motivo: "danado" }).ok).toBe(false);
  });

  it("«Compra sin registrar» is an import, only goes up, and a price becomes the last cost", () => {
    const sinPrecio = planCorreccion({ ...base, nuevo: 22, motivo: "compra" });
    expect(sinPrecio.ok && sinPrecio.plan).toEqual({ type: "import", delta: 12, unitCost: 100, note: "Compra sin registrar", recostear: null });
    const conPrecio = planCorreccion({ ...base, nuevo: 22, motivo: "compra", precio: 1800 });
    expect(conPrecio.ok && conPrecio.plan).toMatchObject({ type: "import", delta: 12, unitCost: 150, recostear: 150 });
    // Same price as today: nothing to re-cost.
    const igual = planCorreccion({ ...base, nuevo: 22, motivo: "compra", precio: 1200 });
    expect(igual.ok && igual.plan.recostear).toBeNull();
    expect(planCorreccion({ ...base, nuevo: 3, motivo: "compra" }).ok).toBe(false);
  });

  it("«Error de receta» is an ajuste with its own note", () => {
    const r = planCorreccion({ ...base, nuevo: 0, motivo: "receta", nota: "latte 230 ml" });
    expect(r.ok && r.plan).toMatchObject({ type: "ajuste", delta: -10, note: "Error de receta · latte 230 ml" });
  });

  it("fixes a negative stock back to what there is", () => {
    const r = planCorreccion({ actual: -568, nuevo: 1200, motivo: "conte", costoUnit: 48 });
    expect(r.ok && r.plan.delta).toBe(1768);
  });

  it("refuses an empty amount, a missing reason and no change", () => {
    expect(planCorreccion({ ...base, nuevo: null, motivo: "conte" })).toEqual({ ok: false, error: "Escribe cuánto hay." });
    expect(planCorreccion({ ...base, nuevo: -1, motivo: "conte" }).ok).toBe(false);
    expect(planCorreccion({ ...base, nuevo: 5, motivo: null }).ok).toBe(false);
    expect(planCorreccion({ ...base, nuevo: 10, motivo: "conte" }).ok).toBe(false);
  });

  it("rounds the delta to 3 decimals and never records a negative cost", () => {
    const r = planCorreccion({ actual: 0.1, nuevo: 0.3, motivo: "conte", costoUnit: -4 });
    expect(r.ok && r.plan).toMatchObject({ delta: 0.2, unitCost: 0 });
  });
});

describe("cantidadDesdeTeclado / tecladoDesdeCantidad", () => {
  it("reads commas and pieces", () => {
    expect(cantidadDesdeTeclado("2,5", 900)).toBe(2250);
    expect(cantidadDesdeTeclado("350", null)).toBe(350);
    expect(cantidadDesdeTeclado("3,", null)).toBe(3);
    expect(cantidadDesdeTeclado("", null)).toBeNull();
    expect(cantidadDesdeTeclado("abc", null)).toBeNull();
  });
  it("goes back to what is typed", () => {
    expect(tecladoDesdeCantidad(2250, 900)).toBe("2,5");
    expect(tecladoDesdeCantidad(18.256, null)).toBe("18,26");
    expect(tecladoDesdeCantidad(-30, null)).toBe("0");
  });
});

describe("valorCambio", () => {
  it("is |delta| × cost, whole pesos", () => {
    expect(valorCambio(-6, 100)).toBe(600);
    expect(valorCambio(230, 3.61)).toBe(830);
    expect(valorCambio(5, 0)).toBe(0);
  });
});
