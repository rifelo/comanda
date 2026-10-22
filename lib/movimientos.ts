/**
 * Pure types + filtering for the Movimientos (stock audit log) view and the
 * per-item kardex. No I/O — unit-tested in movimientos.test.ts. The DB fetch
 * lives in lib/db/movements.ts.
 */

export type MovTipo = "venta" | "gasto" | "ajuste" | "import" | "merma";

export interface MovimientoRow {
  id: string;
  created_at: string;
  type: MovTipo;
  ingrediente_id?: string;
  ingrediente_name: string;
  delta: number;
  balance_after: number;
  unit_cost_cop: number | null;
  note: string | null;
  by_name: string | null;
  /** Folio of the POS order that moved the stock (ventas and their reversals). */
  orden_folio?: string | null;
  /** Folio of the purchase order the goods arrived with. */
  compra_folio?: number | null;
}

export type MovFiltro = "todos" | MovTipo;

export const TIPO_LABEL: Record<MovTipo, string> = {
  venta: "Venta",
  gasto: "Gasto",
  ajuste: "Ajuste",
  import: "Compra",
  merma: "Merma",
};

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
  const header = ["fecha", "ingrediente", "tipo", "delta", "saldo", "costo_unitario", "usuario", "nota"];
  const lines = rows.map((m) =>
    [
      m.created_at,
      JSON.stringify(m.ingrediente_name),
      m.type,
      m.delta,
      m.balance_after,
      m.unit_cost_cop ?? "",
      JSON.stringify(m.by_name ?? ""),
      JSON.stringify(m.note ?? ""),
    ].join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

// ── Kardex ────────────────────────────────────────────────────────────────

/** One kardex line: a movement read as entrada / salida with the running saldo. */
export interface KardexLinea {
  id: string;
  fecha: string;
  tipo: MovTipo;
  /** What happened, for a person: «Venta A-896», «Compra n.º 3 · Alimtec», «Conteo diario 20-oct». */
  detalle: string;
  entrada: number;
  salida: number;
  saldo: number;
  /** Unit cost the movement was valued at (the item's cost at the time), or null when it wasn't recorded. */
  costo: number | null;
  /** Signed value of the movement at that cost (entrada positive, salida negative), 0 when no cost. */
  valor: number;
  usuario: string | null;
  /** True for rows written by automated tests (noise the owner may hide). */
  prueba: boolean;
}

export interface KardexTotales {
  saldoInicial: number;
  entradas: number;
  salidas: number;
  /** Salidas split: what sales consumed, what was lost, what counts/adjustments took or gave back. */
  ventas: number;
  mermas: number;
  ajustes: number;
  saldoFinal: number;
  /** Σ valor of the lines (entries positive, exits negative). */
  valorMovido: number;
  /** Lines with no unit cost recorded — their value is missing from valorMovido. */
  sinCosto: number;
}

const PRUEBA_RE = /\b(e2e|prueba|test)\b/i;

/** Human label for a movement: prefers the note the writer left, prefixed by the type when the note doesn't say it. */
export function detalleMovimiento(m: MovimientoRow): string {
  const note = (m.note ?? "").trim();
  if (m.type === "import" && m.compra_folio != null) return note ? `Compra n.º ${m.compra_folio} · ${note.replace(/^Recepción pedido n\.º \d+\s*·?\s*/i, "")}`.replace(/ · $/, "") : `Compra n.º ${m.compra_folio}`;
  if (m.type === "venta" && m.orden_folio && !note) return `Venta ${m.orden_folio}`;
  if (!note) return TIPO_LABEL[m.type];
  const label = TIPO_LABEL[m.type].toLowerCase();
  return note.toLowerCase().startsWith(label) || m.type === "venta" || m.type === "ajuste" ? note : `${TIPO_LABEL[m.type]} · ${note}`;
}

/**
 * Build kardex lines from a list of movements (any order): oldest first, the
 * running saldo taken from each movement's own balance_after (stamped by the
 * DB trigger, so it is the truth even when movements were inserted together).
 */
export function kardexLineas(movs: ReadonlyArray<MovimientoRow>): KardexLinea[] {
  return [...movs]
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    .map((m) => {
      const entrada = m.delta > 0 ? m.delta : 0;
      const salida = m.delta < 0 ? -m.delta : 0;
      const costo = m.unit_cost_cop;
      return {
        id: m.id,
        fecha: m.created_at,
        tipo: m.type,
        detalle: detalleMovimiento(m),
        entrada,
        salida,
        saldo: m.balance_after,
        costo,
        valor: costo == null ? 0 : Math.round(m.delta * costo),
        usuario: m.by_name,
        prueba: PRUEBA_RE.test(m.note ?? ""),
      };
    });
}

/** Totals for a kardex period. `saldoInicial` = the saldo right before the first line (0 for a new item). */
export function kardexTotales(lineas: ReadonlyArray<KardexLinea>, saldoInicial: number): KardexTotales {
  const t: KardexTotales = { saldoInicial, entradas: 0, salidas: 0, ventas: 0, mermas: 0, ajustes: 0, saldoFinal: saldoInicial, valorMovido: 0, sinCosto: 0 };
  for (const l of lineas) {
    t.entradas += l.entrada;
    t.salidas += l.salida;
    if (l.tipo === "venta") t.ventas += l.salida - l.entrada;
    else if (l.tipo === "merma") t.mermas += l.salida;
    else if (l.tipo === "ajuste") t.ajustes += l.entrada - l.salida;
    t.valorMovido += l.valor;
    if (l.costo == null) t.sinCosto++;
    t.saldoFinal = l.saldo;
  }
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  t.entradas = r3(t.entradas);
  t.salidas = r3(t.salidas);
  t.ventas = r3(t.ventas);
  t.mermas = r3(t.mermas);
  t.ajustes = r3(t.ajustes);
  return t;
}

/** One day of the «costo de venta» chart: what sales used of the item that day and what it cost. */
export interface VentaDia {
  /** Bogotá day, YYYY-MM-DD. */
  dia: string;
  /** Net quantity sold (sales minus reversals of cancelled / changed orders). */
  cantidad: number;
  /** Net cost of what was sold, COP, at the unit cost stamped on each movement. */
  costo: number;
  /** Sale lines that day with no cost stamped (their value is missing from `costo`). */
  sinCosto: number;
}

function bogotaDia(iso: string): string {
  return new Date(new Date(iso).getTime() - 5 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * Cost of sales per day for one item over [desde, hasta] (Bogotá days, both
 * inclusive), every day present even when nothing sold. Only 'venta' lines
 * count; a reversal (positive venta delta) subtracts.
 */
export function costoVentaPorDia(lineas: ReadonlyArray<KardexLinea>, desde: string, hasta: string): VentaDia[] {
  const out = new Map<string, VentaDia>();
  for (let d = new Date(`${desde}T00:00:00Z`); d.toISOString().slice(0, 10) <= hasta; d.setUTCDate(d.getUTCDate() + 1)) {
    const dia = d.toISOString().slice(0, 10);
    out.set(dia, { dia, cantidad: 0, costo: 0, sinCosto: 0 });
  }
  for (const l of lineas) {
    if (l.tipo !== "venta") continue;
    const v = out.get(bogotaDia(l.fecha));
    if (!v) continue;
    v.cantidad += l.salida - l.entrada;
    v.costo -= l.valor;
    if (l.costo == null) v.sinCosto++;
  }
  return [...out.values()].map((v) => ({ ...v, cantidad: Math.round(v.cantidad * 1000) / 1000 }));
}

/** CSV of a kardex: the classic columns (fecha, detalle, entrada, salida, saldo, costo, valor). */
export function kardexToCsv(item: { name: string; unit: string }, lineas: ReadonlyArray<KardexLinea>, saldoInicial: number): string {
  const header = ["fecha", "ingrediente", "unidad", "tipo", "detalle", "entrada", "salida", "saldo", "costo_unitario", "valor", "usuario"];
  const first = ["", JSON.stringify(item.name), item.unit, "", "Saldo inicial", "", "", saldoInicial, "", "", ""].join(",");
  const lines = lineas.map((l) =>
    [l.fecha, JSON.stringify(item.name), item.unit, l.tipo, JSON.stringify(l.detalle), l.entrada || "", l.salida || "", l.saldo, l.costo ?? "", l.valor || "", JSON.stringify(l.usuario ?? "")].join(","),
  );
  return [header.join(","), first, ...lines].join("\n");
}
