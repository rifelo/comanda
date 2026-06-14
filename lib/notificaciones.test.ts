import { describe, it, expect } from "vitest";
import { buildAlertas, type AlertaIngrediente, type CategoriaLite } from "@/lib/notificaciones";

const cats: CategoriaLite[] = [
  { id: "c1", parent_id: null, label: "Cárnicos" },
  { id: "c2", parent_id: "c1", label: "Res" },
];

const ings: AlertaIngrediente[] = [
  { id: "ok", name: "Pan", unit: "und", category_id: null, stock_current: 100, stock_min: 20 },
  { id: "low", name: "Queso", unit: "kg", category_id: "c2", stock_current: 3, stock_min: 5 },
  { id: "out", name: "Carne", unit: "kg", category_id: "c1", stock_current: 0, stock_min: 8 },
  { id: "nothresh", name: "Sal", unit: "g", category_id: null, stock_current: 2, stock_min: 0 },
];

describe("buildAlertas", () => {
  it("classifies each ingredient by stock level", () => {
    const { rows } = buildAlertas(ings, cats);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.level]));
    expect(byId).toEqual({ ok: "ok", low: "bajo", out: "sin", nothresh: "ok" });
  });

  it("orders rows by severity, then alphabetically within a tier", () => {
    const { rows } = buildAlertas(ings, cats);
    // out → low → then the two "ok" rows by name: Pan (ok) before Sal (nothresh)
    expect(rows.map((r) => r.id)).toEqual(["out", "low", "ok", "nothresh"]);
  });

  it("computes summary counts", () => {
    const { counts } = buildAlertas(ings, cats);
    expect(counts).toEqual({ sin: 1, bajo: 1, ok: 2, total: 4 });
  });

  it("builds parent · child category breadcrumbs", () => {
    const { rows } = buildAlertas(ings, cats);
    expect(rows.find((r) => r.id === "low")!.category_label).toBe("Cárnicos · Res");
    expect(rows.find((r) => r.id === "out")!.category_label).toBe("Cárnicos");
    expect(rows.find((r) => r.id === "ok")!.category_label).toBeNull();
  });

  it("handles an empty inventory", () => {
    const { rows, counts } = buildAlertas([], cats);
    expect(rows).toEqual([]);
    expect(counts.total).toBe(0);
  });
});
