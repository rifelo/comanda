import { describe, it, expect } from "vitest";
import {
  costoVentaPorDia,
  detalleMovimiento,
  filterMovimientos,
  kardexLineas,
  kardexTotales,
  kardexToCsv,
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
    expect(lines[0]).toBe("fecha,ingrediente,tipo,delta,saldo,costo_unitario,usuario,nota");
    expect(lines).toHaveLength(4);
  });
  it("quotes names and notes and preserves the signed delta", () => {
    const csv = movimientosToCsv([rows[2]]);
    expect(csv.split("\n")[1]).toBe(
      '2026-06-14T10:00:00Z,"Queso cheddar",import,6,9,980,"Ana","proveedor"',
    );
  });
});

// ── kardex ────────────────────────────────────────────────────────────────

const leche = (over: Partial<MovimientoRow>): MovimientoRow => ({
  id: "x", created_at: "2026-10-21T10:00:00Z", type: "venta", ingrediente_name: "Leche", delta: -180, balance_after: 0, unit_cost_cop: 3.89, note: null, by_name: null, ...over,
});

const movs: MovimientoRow[] = [
  leche({ id: "c", created_at: "2026-10-21T12:00:00Z", type: "venta", delta: -360, balance_after: 10440, note: "Venta A-896", orden_folio: "A-896" }),
  leche({ id: "a", created_at: "2026-10-21T09:00:00Z", type: "ajuste", delta: -35960.5, balance_after: 0, note: "Conteo 21-10-2026 · sin leche antes de la compra", by_name: "Jesus" }),
  leche({ id: "b", created_at: "2026-10-21T09:00:01Z", type: "import", delta: 10800, balance_after: 10800, note: "Recepción pedido n.º 3 · Gran Vía", compra_folio: 3 }),
  leche({ id: "d", created_at: "2026-10-21T13:00:00Z", type: "merma", delta: -900, balance_after: 9540, unit_cost_cop: null, note: "Bolsa vencida · E2E cleanup" }),
];

describe("kardexLineas", () => {
  const lineas = kardexLineas(movs);
  it("orders oldest first and splits delta into entrada / salida", () => {
    expect(lineas.map((l) => l.id)).toEqual(["a", "b", "c", "d"]);
    expect(lineas[1]).toMatchObject({ entrada: 10800, salida: 0, saldo: 10800 });
    expect(lineas[2]).toMatchObject({ entrada: 0, salida: 360, saldo: 10440 });
  });
  it("values each line at its recorded unit cost, signed, and 0 when no cost", () => {
    expect(lineas[1].valor).toBe(Math.round(10800 * 3.89));
    expect(lineas[2].valor).toBe(Math.round(-360 * 3.89));
    expect(lineas[3].valor).toBe(0);
    expect(lineas[3].costo).toBeNull();
  });
  it("names the movement for a person", () => {
    expect(lineas[0].detalle).toBe("Conteo 21-10-2026 · sin leche antes de la compra");
    expect(lineas[1].detalle).toBe("Compra n.º 3 · Gran Vía");
    expect(lineas[2].detalle).toBe("Venta A-896");
    expect(lineas[3].detalle).toBe("Merma · Bolsa vencida · E2E cleanup");
  });
  it("flags test noise", () => {
    expect(lineas.map((l) => l.prueba)).toEqual([false, false, false, true]);
  });
});

describe("detalleMovimiento", () => {
  it("falls back to the type label and to the order folio", () => {
    expect(detalleMovimiento(leche({ note: null, type: "ajuste" }))).toBe("Ajuste");
    expect(detalleMovimiento(leche({ note: null, orden_folio: "A-12" }))).toBe("Venta A-12");
    expect(detalleMovimiento(leche({ note: null, type: "import", compra_folio: 7 }))).toBe("Compra n.º 7");
  });
});

describe("kardexTotales", () => {
  it("sums entradas, salidas by kind and keeps the last saldo", () => {
    const t = kardexTotales(kardexLineas(movs), 35960.5);
    expect(t.saldoInicial).toBe(35960.5);
    expect(t.entradas).toBe(10800);
    expect(t.salidas).toBe(35960.5 + 360 + 900);
    expect(t.ventas).toBe(360);
    expect(t.mermas).toBe(900);
    expect(t.ajustes).toBe(-35960.5);
    expect(t.saldoFinal).toBe(9540);
    expect(t.sinCosto).toBe(1);
    expect(t.valorMovido).toBe(Math.round(-35960.5 * 3.89) + Math.round(10800 * 3.89) + Math.round(-360 * 3.89));
  });
  it("is empty-safe", () => {
    expect(kardexTotales([], 5)).toMatchObject({ saldoInicial: 5, saldoFinal: 5, entradas: 0, salidas: 0, sinCosto: 0 });
  });
});

describe("costoVentaPorDia", () => {
  it("fills every day, counts only sales, nets reversals and buckets by Bogotá day", () => {
    const ls = kardexLineas([
      ...movs,
      // 03:00Z on the 22nd is still the 21st in Bogotá.
      leche({ id: "e", created_at: "2026-10-22T03:00:00Z", type: "venta", delta: 180, balance_after: 9720, note: "Cambio en A-905" }),
      leche({ id: "f", created_at: "2026-10-22T15:00:00Z", type: "venta", delta: -180, balance_after: 9540 }),
    ]);
    const dias = costoVentaPorDia(ls, "2026-10-20", "2026-10-22");
    expect(dias.map((d) => d.dia)).toEqual(["2026-10-20", "2026-10-21", "2026-10-22"]);
    expect(dias[0]).toMatchObject({ cantidad: 0, costo: 0 });
    expect(dias[1].cantidad).toBe(360 - 180);
    expect(dias[1].costo).toBe(-Math.round(-360 * 3.89) - Math.round(180 * 3.89));
    expect(dias[2]).toMatchObject({ cantidad: 180, costo: -Math.round(-180 * 3.89) });
  });
});

describe("kardexToCsv", () => {
  it("starts with the header and a saldo inicial line, then one line per movement", () => {
    const csv = kardexToCsv({ name: "Leche", unit: "ml" }, kardexLineas(movs), 35960.5);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("fecha,ingrediente,unidad,tipo,detalle,entrada,salida,saldo,costo_unitario,valor,usuario");
    expect(lines[1]).toBe(',"Leche",ml,,Saldo inicial,,,35960.5,,,');
    expect(lines).toHaveLength(6);
    expect(lines[3]).toBe('2026-10-21T09:00:01Z,"Leche",ml,import,"Compra n.º 3 · Gran Vía",10800,,10800,3.89,42012,""');
  });
});
