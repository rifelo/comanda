import { describe, expect, it } from "vitest";
import { defaultMergeTarget, folioNumber, mergePreview } from "./combinar";
import type { PosOrder } from "./types";

const order = (folio: string, over: Partial<PosOrder> = {}): PosOrder => ({
  id: folio, folio, status: "pendiente", orderType: "aqui", total: 0, sinGluten: false, note: "", customerName: "", customerNames: [],
  createdAt: "2026-09-21T10:00:00Z", paidAt: null, paymentMethod: null, tendered: null, change: 0, paid: 0, pagos: [], items: [], mergedInto: null, mergedIntoFolio: null, ...over,
});
const item = (qty: number) => ({ id: `i${qty}`, kind: "item" as const, productoId: "p", comboId: null, name: "Latte", qty, unitPrice: 7500, mods: {}, position: 0, customer: "" });

describe("folioNumber / defaultMergeTarget", () => {
  it("picks the lowest folio number", () => {
    expect(folioNumber("A-73")).toBe(73);
    expect(folioNumber("PRUEBA")).toBe(0);
    expect(defaultMergeTarget([order("A-80"), order("A-9"), order("A-100")])).toBe("A-9");
    expect(defaultMergeTarget([])).toBeNull();
  });
});

describe("mergePreview", () => {
  it("unions the roster (target first, case-insensitive) and sums totals, items and payments", () => {
    const t = order("A-70", { customerNames: ["Juan", "María"], total: 15000, paid: 7000, items: [item(2)] });
    const s1 = order("A-72", { customerNames: ["maría", "Pedro"], total: 9000, items: [item(1)] });
    const s2 = order("A-75", { customerNames: [], customerName: "Mesa 3", total: 4500, paid: 4500, items: [item(1)] });
    expect(mergePreview(t, [s1, s2])).toEqual({
      targetFolio: "A-70", sourceFolios: ["A-72", "A-75"], people: ["Juan", "María", "Pedro"], items: 4, total: 28500, paid: 11500, remaining: 17000,
    });
  });
});
