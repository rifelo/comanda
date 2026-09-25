import { describe, expect, it } from "vitest";
import { buildRapido, fraseFaltantes, resumenReporte } from "./faltantes";

const ings = [
  { id: "cafe", name: "Café", unit: "g", prioridad: 1, stock_current: 500, stock_min: 200 },
  { id: "leche", name: "Leche", unit: "ml", prioridad: 1, stock_current: 0, stock_min: 900 },
  { id: "vasos", name: "Vasos 12oz", unit: "und", prioridad: 1, stock_current: 30, stock_min: 50 },
  { id: "panela", name: "Panela", unit: "und", prioridad: 2, stock_current: 5, stock_min: 0 },
  { id: "azucar", name: "Azúcar", unit: "g", prioridad: 0, stock_current: 5, stock_min: 0 },
  { id: "old", name: "Viejo", unit: "und", prioridad: 1, stock_current: 5, stock_min: 0, archived: true },
];

describe("buildRapido", () => {
  it("keeps only priority, non-archived items, grouped by priority", () => {
    const v = buildRapido(ings, []);
    expect(v.groups.map((g) => g.label)).toEqual(["Crítico", "Importante"]);
    expect(v.groups[0].rows.map((r) => r.id)).not.toContain("azucar");
    expect(v.groups[0].rows.map((r) => r.id)).not.toContain("old");
    expect(v.counts.total).toBe(4);
  });

  it("orders flagged items first, then what the system thinks is short, then by name", () => {
    const v = buildRapido(ings, [
      { id: "r1", ingrediente_id: "cafe", estado: "bajo", reported_at: "2026-09-24T10:00:00Z", reported_by_name: "Ana", note: null },
      { id: "r2", ingrediente_id: "vasos", estado: "agotado", reported_at: "2026-09-24T09:00:00Z", reported_by_name: null, note: "se acabaron" },
    ]);
    // vasos (agotado) → cafe (bajo) → leche (system: sin, no report)
    expect(v.groups[0].rows.map((r) => r.id)).toEqual(["vasos", "cafe", "leche"]);
    expect(v.groups[0].rows[2].sistema).toBe("sin");
    expect(v.groups[0].rows[2].estado).toBeNull();
    expect(v.counts).toEqual({ agotado: 1, bajo: 1, total: 4 });
  });

  it("uses the newest open report of an ingredient", () => {
    const v = buildRapido(ings, [
      { id: "old", ingrediente_id: "cafe", estado: "agotado", reported_at: "2026-09-23T10:00:00Z", reported_by_name: null, note: null },
      { id: "new", ingrediente_id: "cafe", estado: "bajo", reported_at: "2026-09-24T10:00:00Z", reported_by_name: null, note: null },
    ]);
    const cafe = v.groups[0].rows.find((r) => r.id === "cafe")!;
    expect(cafe.estado).toBe("bajo");
    expect(cafe.reporte_id).toBe("new");
  });
});

describe("resumenReporte / fraseFaltantes", () => {
  it("counts a batch of taps", () => {
    expect(resumenReporte([{ estado: "ok" }, { estado: "agotado" }, { estado: "agotado" }, { estado: "bajo" }])).toEqual({ agotado: 2, bajo: 1, ok: 1, total: 4 });
  });
  it("phrases what is short", () => {
    expect(fraseFaltantes({ agotado: 2, bajo: 1 })).toBe("2 agotados · 1 poco");
    expect(fraseFaltantes({ agotado: 1, bajo: 0 })).toBe("1 agotado");
    expect(fraseFaltantes({ agotado: 0, bajo: 0 })).toBe("");
  });
});
