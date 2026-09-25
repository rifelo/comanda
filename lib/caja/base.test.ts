import { describe, expect, it } from "vitest";
import { describirLineas, mismasLineas, planBase, sencilloDe } from "./base";

const sum = (xs: { valor: number; cantidad: number }[]) => xs.reduce((s, x) => s + x.valor * x.cantidad, 0);

describe("planBase", () => {
  it("leaves the smallest pieces that reach the target exactly", () => {
    const contado = [
      { valor: 50000, cantidad: 2 },
      { valor: 20000, cantidad: 3 },
      { valor: 10000, cantidad: 4 },
      { valor: 2000, cantidad: 10 },
      { valor: 1000, cantidad: 6 },
      { valor: 500, cantidad: 8 },
    ];
    const p = planBase(contado, 50000);
    expect(p.exacto).toBe(true);
    expect(p.total).toBe(50000);
    // all coins and small bills first: 8×500 + 6×1000 + 10×2000 = 30.000, then 2×10.000
    expect(p.lineas).toEqual([
      { valor: 10000, cantidad: 2 },
      { valor: 2000, cantidad: 10 },
      { valor: 1000, cantidad: 6 },
      { valor: 500, cantidad: 8 },
    ]);
    expect(sum(p.resto)).toBe(sum(contado) - 50000);
    expect(p.resto).toEqual([
      { valor: 50000, cantidad: 2 },
      { valor: 20000, cantidad: 3 },
      { valor: 10000, cantidad: 2 },
    ]);
  });

  it("keeps a balanced mix instead of piling up one small denomination", () => {
    const contado = [
      { valor: 50000, cantidad: 3 },
      { valor: 20000, cantidad: 4 },
      { valor: 10000, cantidad: 3 },
      { valor: 5000, cantidad: 4 },
      { valor: 2000, cantidad: 10 },
      { valor: 1000, cantidad: 20 },
      { valor: 500, cantidad: 40 },
    ];
    const p = planBase(contado, 50000);
    expect(p.exacto).toBe(true);
    const by = Object.fromEntries(p.lineas.map((l) => [l.valor, l.cantidad]));
    // not all 40 coins, and some $5.000 / $10.000 for bigger change
    expect(by[500]).toBeLessThanOrEqual(12);
    expect(by[5000]).toBeGreaterThanOrEqual(2);
    expect(by[1000]).toBeGreaterThanOrEqual(8);
    expect(by[2000]).toBeGreaterThanOrEqual(6);
    expect(by[20000] ?? 0).toBe(0);
    expect(by[50000] ?? 0).toBe(0);
    const sen = sencilloDe(p.lineas, 50000);
    expect(sen.ok).toBe(true);
    expect(sen.grandes).toBe(0);
    expect(sen.escasea).toEqual([]);
  });

  it("uses a big bill only when the small ones cannot form the target", () => {
    const p = planBase([{ valor: 50000, cantidad: 1 }, { valor: 10000, cantidad: 2 }, { valor: 1000, cantidad: 3 }], 50000);
    expect(p.exacto).toBe(true);
    expect(p.lineas).toEqual([{ valor: 50000, cantidad: 1 }]);
    expect(p.resto).toEqual([{ valor: 10000, cantidad: 2 }, { valor: 1000, cantidad: 3 }]);
  });

  it("reports a short base when the exact target is unreachable", () => {
    const p = planBase([{ valor: 50000, cantidad: 2 }, { valor: 20000, cantidad: 1 }], 30000);
    expect(p.exacto).toBe(false);
    expect(p.total).toBe(20000);
    expect(p.faltante).toBe(10000);
    expect(p.lineas).toEqual([{ valor: 20000, cantidad: 1 }]);
  });

  it("keeps everything when the drawer holds less than the target", () => {
    const p = planBase([{ valor: 2000, cantidad: 3 }], 50000);
    expect(p.exacto).toBe(false);
    expect(p.total).toBe(6000);
    expect(p.faltante).toBe(44000);
    expect(p.resto).toEqual([]);
  });

  it("handles a zero target and an empty count", () => {
    expect(planBase([], 50000)).toMatchObject({ total: 0, exacto: false, faltante: 50000, lineas: [] });
    expect(planBase([{ valor: 1000, cantidad: 2 }], 0)).toMatchObject({ total: 0, exacto: true, lineas: [], resto: [{ valor: 1000, cantidad: 2 }] });
  });

  it("ignores denominations with zero pieces", () => {
    const p = planBase([{ valor: 20000, cantidad: 0 }, { valor: 5000, cantidad: 4 }], 20000);
    expect(p.lineas).toEqual([{ valor: 5000, cantidad: 4 }]);
    expect(p.exacto).toBe(true);
  });
});

describe("sencilloDe", () => {
  it("flags a base made of big bills", () => {
    const sen = sencilloDe([{ valor: 50000, cantidad: 1 }], 50000);
    expect(sen.ok).toBe(false);
    expect(sen.grandes).toBe(50000);
    expect(sen.escasea).toEqual([500, 1000, 2000, 5000]);
  });
});

describe("describirLineas / mismasLineas", () => {
  it("formats and compares compositions", () => {
    const fmt = (n: number) => `$${n}`;
    expect(describirLineas([{ valor: 2000, cantidad: 5 }, { valor: 500, cantidad: 2 }], fmt)).toBe("5 × $2000 · 2 × $500");
    expect(mismasLineas([{ valor: 2000, cantidad: 5 }, { valor: 500, cantidad: 2 }], [{ valor: 500, cantidad: 2 }, { valor: 2000, cantidad: 5 }, { valor: 100, cantidad: 0 }])).toBe(true);
    expect(mismasLineas([{ valor: 2000, cantidad: 5 }], [{ valor: 2000, cantidad: 4 }])).toBe(false);
  });
});
