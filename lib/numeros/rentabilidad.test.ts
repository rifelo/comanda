import { describe, expect, it } from "vitest";
import { fijosPorDia, rentabilidadDia, type CostoProducto } from "./rentabilidad";

const costos = new Map<string, CostoProducto>([
  ["latte", { costo: 3000, categoria: "Caliente" }],
  ["tinto", { costo: 1650, categoria: "Caliente" }],
  ["torta", { costo: 6000, categoria: "Postres" }],
  ["jugo", { costo: 2000, categoria: "Jugos" }],
]);
const opciones = new Map([["g1|En leche", 800]]);
const fijos = { dia: 100_000, mes: 3_100_000, diasMes: 31, mesFuente: "2026-10" };
const item = (key: string, qty: number, unitPrice: number, mods: Record<string, string> = {}) => ({ key, name: key, qty, unitPrice, mods });

describe("rentabilidadDia", () => {
  const r = rentabilidadDia({
    items: [item("latte", 2, 8000), item("tinto", 3, 3000), item("torta", 1, 7000), item("jugo", 1, 8000, { g1: "En leche" }), item("nuevo", 1, 5000)],
    costos,
    costosOpcion: opciones,
    cobrosNoEfectivo: 20_000,
    gastosDia: [{ categoria: "mantenimiento", monto: 10_000 }, { categoria: "arriendo", monto: 1_500_000 }],
    fijos,
  });
  const by = new Map(r.productos.map((p) => [p.key, p]));

  it("costs each product with its recipe and the chosen option", () => {
    expect(by.get("latte")).toMatchObject({ unidades: 2, ingreso: 16000, costo: 6000, utilidad: 10000, margen: 63, bajo: false });
    expect(by.get("jugo")).toMatchObject({ costo: 2800, utilidad: 5200, margen: 65 });
  });
  it("flags a low margin, but not on postres (a hook) nor without cost", () => {
    expect(by.get("tinto")).toMatchObject({ margen: 45, bajo: true });
    expect(by.get("torta")).toMatchObject({ margen: 14, bajo: false });
    expect(by.get("nuevo")).toMatchObject({ sinCosto: true, bajo: false, utilidad: 5000 });
    expect(r.sinCosto).toEqual({ productos: 1, ingreso: 5000 });
  });
  it("sorts by what each product left", () => {
    expect(r.productos.map((p) => p.key)).toEqual(["latte", "jugo", "nuevo", "tinto", "torta"]);
  });
  it("builds the day: gross, Bold estimate, other expenses, fixed share", () => {
    expect(r.ventas).toBe(45000);
    expect(r.costoVenta).toBe(6000 + 4950 + 6000 + 2800);
    expect(r.utilidadBruta).toBe(45000 - 19750);
    expect(r.comision).toEqual({ monto: 300.2, estimada: true, base: 20000 });
    expect(r.otrosGastos).toBe(10000); // the rent booked that day is spread, not counted
    expect(r.utilidadNeta).toBe(Math.round(25250 - 300.2 - 10000 - 100000));
    expect(r.categorias[0]).toMatchObject({ categoria: "Caliente", ingreso: 25000, costo: 10950 });
  });
  it("break-even = expenses ÷ contribution after the fee", () => {
    const contrib = 25250 / 45000 - 300.2 / 45000;
    expect(r.equilibrio).toBe(Math.round(110000 / contrib));
  });
  it("uses the fee booked that day instead of the estimate", () => {
    const b = rentabilidadDia({ items: [item("latte", 1, 8000)], costos, costosOpcion: opciones, cobrosNoEfectivo: 8000, gastosDia: [{ categoria: "comisiones", monto: 4345.4 }], fijos });
    expect(b.comision).toEqual({ monto: 4345.4, estimada: false, base: 8000 });
  });
  it("has no break-even without sales", () => {
    const e = rentabilidadDia({ items: [], costos, costosOpcion: opciones, cobrosNoEfectivo: 0, gastosDia: [], fijos });
    expect(e).toMatchObject({ ventas: 0, margenBruto: null, equilibrio: null, utilidadNeta: -100000 });
  });
});

describe("fijosPorDia", () => {
  it("spreads rent, utilities and payroll over the month", () => {
    expect(fijosPorDia([{ categoria: "arriendo", monto: 1_500_000 }, { categoria: "servicios", monto: 450_000 }, { categoria: "nomina", monto: 4_068_750 }, { categoria: "comisiones", monto: 4345.4 }], 31)).toEqual({ mes: 6_018_750, dia: 194_153 });
  });
});
