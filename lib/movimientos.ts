/**
 * Pure types + filtering for the Movimientos (stock audit log) view.
 * No I/O — unit-tested in movimientos.test.ts. The DB fetch lives in
 * lib/db/movements.ts.
 */

export type MovTipo = "venta" | "gasto" | "ajuste" | "import";

export interface MovimientoRow {
  id: string;
  created_at: string;
  type: MovTipo;
  ingrediente_name: string;
  delta: number;
  balance_after: number;
  unit_cost_cop: number | null;
  note: string | null;
  by_name: string | null;
}

export type MovFiltro = "todos" | MovTipo;

/** Filter movements by type and a free-text query over name + note. */
export function filterMovimientos(
  rows: ReadonlyArray<MovimientoRow>,
  { tipo, query }: { tipo: MovFiltro; query: string },
): MovimientoRow[] {
  const needle = query.trim().toLowerCase();
  return rows.filter((m) => {
    if (tipo !== "todos" && m.type !== tipo) return false;
    if (needle) {
      const hay = `${m.ingrediente_name} ${m.note ?? ""}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

/** CSV (header + rows) for the given movements — used by the export button. */
export function movimientosToCsv(rows: ReadonlyArray<MovimientoRow>): string {
  const header = ["fecha", "ingrediente", "tipo", "delta", "saldo", "usuario", "nota"];
  const lines = rows.map((m) =>
    [
      m.created_at,
      JSON.stringify(m.ingrediente_name),
      m.type,
      m.delta,
      m.balance_after,
      JSON.stringify(m.by_name ?? ""),
      JSON.stringify(m.note ?? ""),
    ].join(","),
  );
  return [header.join(","), ...lines].join("\n");
}
