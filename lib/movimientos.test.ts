import { describe, it, expect } from "vitest";
import {
  filterMovimientos,
  movimientosToCsv,
  type MovimientoRow,
} from "@/lib/movimientos";

const rows: MovimientoRow[] = [
  { id: "1", created_at: "2026-06-14T12:00:00Z", type: "venta", ingrediente_name: "Pan brioche", delta: -2, balance_after: 20, unit_cost_cop: null, note: null, by_name: "POS" },
  { id: "2", created_at: "2026-06-14T11:00:00Z", type: "ajuste", ingrediente_name: "Carne molida", delta: -1, balance_after: 14, unit_cost_cop: null, note: "merma", by_name: "Ana" },
  { id: "3", created_at: "2026-06-14T10:00:00Z", type: "import", ingrediente_name: "Queso cheddar", delta: 6, balance_after: 9, unit_cost_cop: 980, note: "proveedor", by_name: "Ana" },
];

describe("filterMovimientos", () => {
  it("returns all rows for tipo=todos and empty query", () => {
    expect(filterMovimientos(rows, { tipo: "todos", query: "" })).toHaveLength(3);
  });
  it("filters by type", () => {
    const r = filterMovimientos(rows, { tipo: "ajuste", query: "" });
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe("2");
  });
  it("matches the query against ingredient name (case-insensitive)", () => {
    const r = filterMovimientos(rows, { tipo: "todos", query: "PAN" });
    expect(r.map((m) => m.id)).toEqual(["1"]);
  });
  it("matches the query against the note", () => {
    const r = filterMovimientos(rows, { tipo: "todos", query: "merma" });
    expect(r.map((m) => m.id)).toEqual(["2"]);
  });
  it("combines type and query (AND)", () => {
    expect(filterMovimientos(rows, { tipo: "venta", query: "queso" })).toHaveLength(0);
  });
  it("ignores surrounding whitespace in the query", () => {
    expect(filterMovimientos(rows, { tipo: "todos", query: "  queso  " })).toHaveLength(1);
  });
});

describe("movimientosToCsv", () => {
  it("emits a header plus one line per row", () => {
    const csv = movimientosToCsv(rows);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("fecha,ingrediente,tipo,delta,saldo,usuario,nota");
    expect(lines).toHaveLength(4);
  });
  it("quotes names and notes and preserves the signed delta", () => {
    const csv = movimientosToCsv([rows[2]]);
    expect(csv.split("\n")[1]).toBe(
      '2026-06-14T10:00:00Z,"Queso cheddar",import,6,9,"Ana","proveedor"',
    );
  });
});
