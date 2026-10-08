import { describe, expect, it } from "vitest";
import { conteoNormal, esTurnoDeCierre, rutinaHoy } from "./rutina";

const now = new Date("2026-10-08T23:00:00Z");
const hace = (dias: number) => new Date(now.getTime() - dias * 86_400_000).toISOString();

describe("rutinaHoy", () => {
  it("quick count on an ordinary day, full count on its weekday", () => {
    expect(rutinaHoy({ todayIdx: 2, completoDia: 6, kindsHoy: [], lastCompletoAt: hace(3), now })).toMatchObject({ toca: "diario", hecho: false, completoAtrasado: false });
    expect(rutinaHoy({ todayIdx: 6, completoDia: 6, kindsHoy: [], lastCompletoAt: hace(7), now })).toMatchObject({ toca: "completo", hecho: false });
  });
  it("a full count covers the quick one, not the other way round", () => {
    expect(rutinaHoy({ todayIdx: 2, completoDia: 6, kindsHoy: ["completo"], lastCompletoAt: hace(0), now }).hecho).toBe(true);
    expect(rutinaHoy({ todayIdx: 2, completoDia: 6, kindsHoy: ["diario"], lastCompletoAt: hace(3), now }).hecho).toBe(true);
    expect(rutinaHoy({ todayIdx: 6, completoDia: 6, kindsHoy: ["diario"], lastCompletoAt: hace(7), now }).hecho).toBe(false);
  });
  it("flags a skipped full count on the other days", () => {
    expect(rutinaHoy({ todayIdx: 1, completoDia: 6, kindsHoy: [], lastCompletoAt: hace(9), now })).toMatchObject({ toca: "diario", completoAtrasado: true, diasDesdeCompleto: 9 });
    expect(rutinaHoy({ todayIdx: 1, completoDia: 6, kindsHoy: [], lastCompletoAt: null, now })).toMatchObject({ completoAtrasado: true, diasDesdeCompleto: null });
  });
});

describe("conteoNormal", () => {
  const l = (expected: number, counted: number, pieza: number | null = null, unit_cost_cop = 10) => ({ expected, counted, pieza, unit_cost_cop });
  it("accepts slips of one piece or ten percent", () => {
    expect(conteoNormal([l(2700, 1800, 900, 5), l(1000, 920), l(12, 11)])).toBe(true);
    expect(conteoNormal([])).toBe(true);
  });
  it("rejects a line that is far off", () => {
    expect(conteoNormal([l(2700, 900, 900, 5)])).toBe(false);
    expect(conteoNormal([l(1000, 850)])).toBe(false);
    expect(conteoNormal([l(12, 9)])).toBe(false);
  });
  it("rejects a negative expected stock and an expensive total", () => {
    expect(conteoNormal([l(-5, 0)])).toBe(false);
    expect(conteoNormal([l(5000, 4600, null, 48), l(5000, 4600, null, 48)])).toBe(false);
  });
});

describe("esTurnoDeCierre", () => {
  it("is the turno that ends last", () => {
    expect(esTurnoDeCierre("20:00", ["13:00", "20:00"])).toBe(true);
    expect(esTurnoDeCierre("13:00", ["13:00", "20:00"])).toBe(false);
    expect(esTurnoDeCierre("20:00", ["20:00"])).toBe(true);
  });
});
