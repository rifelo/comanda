import { describe, expect, it } from "vitest";
import { errorMerma, resumenMermas, salidasMerma } from "./mermas";

describe("salidasMerma", () => {
  it("a product takes out its whole recipe × qty, at recipe cost", () => {
    const receta = [
      { ingredienteId: "cafe", qty: 18, costo: 48 },
      { ingredienteId: "leche", qty: 230, costo: 4 },
      { ingredienteId: "vaso", qty: 1, costo: 358.33 },
    ];
    const r = salidasMerma({ kind: "producto", receta, qty: 2 });
    expect(r.salidas).toEqual([
      { ingredienteId: "cafe", delta: -36, costoUnitario: 48 },
      { ingredienteId: "leche", delta: -460, costoUnitario: 4 },
      { ingredienteId: "vaso", delta: -2, costoUnitario: 358.33 },
    ]);
    expect(r.costo).toBe(1728 + 1840 + 717);
  });
  it("merges repeated ingredients and skips empty lines", () => {
    const r = salidasMerma({ kind: "producto", receta: [{ ingredienteId: "a", qty: 1, costo: 10 }, { ingredienteId: "a", qty: 0.5, costo: 10 }, { ingredienteId: "b", qty: 0, costo: 5 }], qty: 1 });
    expect(r.salidas).toEqual([{ ingredienteId: "a", delta: -1.5, costoUnitario: 10 }]);
    expect(r.costo).toBe(15);
  });
  it("an ingredient takes out just its qty", () => {
    expect(salidasMerma({ kind: "insumo", ingredienteId: "leche", costo: 4, qty: 900 }))
      .toEqual({ salidas: [{ ingredienteId: "leche", delta: -900, costoUnitario: 4 }], costo: 3600 });
  });
});

describe("errorMerma", () => {
  const ok = { qty: 1, motivo: "se_cayo", justificacion: "Se resbaló el vaso al entregarlo" };
  it("accepts a complete merma", () => expect(errorMerma(ok)).toBeNull());
  it("requires a quantity", () => expect(errorMerma({ ...ok, qty: null })).toMatch(/cuánto/));
  it("products go in whole units", () => expect(errorMerma({ ...ok, qty: 1.5, producto: true })).toMatch(/enteras/));
  it("requires a known reason", () => expect(errorMerma({ ...ok, motivo: "x" })).toMatch(/qué pasó/));
  it("requires a justification", () => {
    expect(errorMerma({ ...ok, justificacion: "  ok " })).toMatch(/obligatoria/);
  });
});

describe("resumenMermas", () => {
  it("adds cost and count by reason and by person, largest first", () => {
    const r = resumenMermas([
      { motivo: "se_cayo", costo: 3000, reportedBy: "Pipe" },
      { motivo: "vencido", costo: 9000, reportedBy: "Estiben" },
      { motivo: "se_cayo", costo: 2500, reportedBy: "Pipe" },
      { motivo: "otro", costo: 0, reportedBy: null },
    ]);
    expect(r.n).toBe(4);
    expect(r.costo).toBe(14500);
    expect(r.porMotivo).toEqual([
      { motivo: "vencido", n: 1, costo: 9000 },
      { motivo: "se_cayo", n: 2, costo: 5500 },
      { motivo: "otro", n: 1, costo: 0 },
    ]);
    expect(r.porPersona.map((p) => p.quien)).toEqual(["Estiben", "Pipe", "Sin nombre"]);
  });
});
