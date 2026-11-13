import { describe, expect, it } from "vitest";
import { cancelMotivo, modLabels } from "./detalle";
import { cancelNotes } from "./pagos";

describe("modLabels", () => {
  const groups = { g1: { name: "Leche" }, g2: { name: "Extras" } };
  it("names each group with its options", () => {
    expect(modLabels({ g1: "Deslactosada", g2: ["Shot extra", "Canela"] }, groups)).toEqual(["Leche: Deslactosada", "Extras: Shot extra, Canela"]);
  });
  it("skips empty selections and keeps options of unknown groups", () => {
    expect(modLabels({ g1: null, g2: [], gx: "Grande" }, groups)).toEqual(["Grande"]);
    expect(modLabels(undefined, groups)).toEqual([]);
  });
});

describe("cancelMotivo", () => {
  it("reads the reason cancelNotes wrote", () => {
    expect(cancelMotivo(cancelNotes(null, "Duplicado", 0))).toBe("Duplicado");
    expect(cancelMotivo(cancelNotes("sin azúcar", "Otro: se equivocó de bebida", 0))).toBe("Otro: se equivocó de bebida");
    expect(cancelMotivo(cancelNotes(null, "Cliente se fue", 8000))).toBe("Cliente se fue");
  });
  it("is empty without a reason", () => {
    expect(cancelMotivo(cancelNotes("sin azúcar", undefined, 0))).toBe("");
    expect(cancelMotivo("")).toBe("");
    expect(cancelMotivo(null)).toBe("");
  });
});
