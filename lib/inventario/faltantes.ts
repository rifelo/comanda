/**
 * Pure helpers for the quick inventory on the tablet ("Faltantes"): the
 * priority list, what state each item is in and how the list is ordered.
 * No I/O — tested in faltantes.test.ts. DB helpers live in faltantes-db.ts.
 */
import { stockLevel, type StockLevel } from "@/lib/cost";

export type FaltanteEstado = "ok" | "bajo" | "agotado";
/** ingredientes.prioridad: 0 = not on the quick list. */
export type Prioridad = 0 | 1 | 2 | 3;

export const PRIORIDADES: ReadonlyArray<{ value: 1 | 2 | 3; label: string; hint: string }> = [
  { value: 1, label: "Crítico", hint: "Sin esto no se vende (café, leche, vasos…)." },
  { value: 2, label: "Importante", hint: "Se nota si falta; se puede aguantar un rato." },
  { value: 3, label: "Normal", hint: "Conviene tenerlo a la vista, sin urgencia." },
];

export const ESTADOS: Record<FaltanteEstado, { label: string; short: string; color: string }> = {
  ok: { label: "Hay", short: "hay", color: "var(--green)" },
  bajo: { label: "Poco", short: "poco", color: "var(--amber)" },
  agotado: { label: "Se acabó", short: "agotado", color: "var(--red)" },
};

export interface RapidoIngrediente {
  id: string;
  name: string;
  unit: string;
  prioridad: number;
  stock_current: number;
  stock_min: number;
  archived?: boolean;
}

/** An unresolved report (the current state of that ingredient). */
export interface FaltanteAbierto {
  id: string;
  ingrediente_id: string;
  estado: FaltanteEstado;
  reported_at: string;
  reported_by_name: string | null;
  note: string | null;
}

export interface RapidoRow {
  id: string;
  name: string;
  unit: string;
  prioridad: number;
  stock_current: number;
  stock_min: number;
  /** What the system thinks, from stock_current vs stock_min. */
  sistema: StockLevel;
  /** The open report, if any — null means nobody flagged it. */
  estado: FaltanteEstado | null;
  reporte_id: string | null;
  reported_at: string | null;
  reported_by_name: string | null;
  note: string | null;
}

export interface RapidoGroup {
  prioridad: 1 | 2 | 3;
  label: string;
  rows: RapidoRow[];
}

export interface RapidoView {
  groups: RapidoGroup[];
  counts: { agotado: number; bajo: number; total: number };
}

const ESTADO_RANK: Record<FaltanteEstado, number> = { agotado: 0, bajo: 1, ok: 2 };
const SISTEMA_RANK: Record<StockLevel, number> = { sin: 0, bajo: 1, ok: 2 };

/**
 * The quick list: priority ingredients grouped by priority, the flagged ones
 * first inside each group (se acabó, then poco), then what the system
 * thinks is short, then alphabetical.
 */
export function buildRapido(ingredientes: ReadonlyArray<RapidoIngrediente>, abiertos: ReadonlyArray<FaltanteAbierto>): RapidoView {
  const openByIng = new Map<string, FaltanteAbierto>();
  for (const a of abiertos) {
    const prev = openByIng.get(a.ingrediente_id);
    if (!prev || a.reported_at > prev.reported_at) openByIng.set(a.ingrediente_id, a);
  }
  const rows: RapidoRow[] = ingredientes
    .filter((i) => !i.archived && i.prioridad > 0)
    .map((i) => {
      const open = openByIng.get(i.id) ?? null;
      return {
        id: i.id,
        name: i.name,
        unit: i.unit,
        prioridad: i.prioridad,
        stock_current: i.stock_current,
        stock_min: i.stock_min,
        sistema: stockLevel(i.stock_current, i.stock_min),
        estado: open?.estado ?? null,
        reporte_id: open?.id ?? null,
        reported_at: open?.reported_at ?? null,
        reported_by_name: open?.reported_by_name ?? null,
        note: open?.note ?? null,
      };
    });
  rows.sort(
    (a, b) =>
      a.prioridad - b.prioridad ||
      (a.estado ? ESTADO_RANK[a.estado] : 3) - (b.estado ? ESTADO_RANK[b.estado] : 3) ||
      SISTEMA_RANK[a.sistema] - SISTEMA_RANK[b.sistema] ||
      a.name.localeCompare(b.name, "es"),
  );
  const groups: RapidoGroup[] = PRIORIDADES.map((p) => ({ prioridad: p.value, label: p.label, rows: rows.filter((r) => r.prioridad === p.value) })).filter((g) => g.rows.length > 0);
  const counts = { agotado: 0, bajo: 0, total: rows.length };
  for (const r of rows) {
    if (r.estado === "agotado") counts.agotado += 1;
    else if (r.estado === "bajo") counts.bajo += 1;
  }
  return { groups, counts };
}

export interface ResumenReporte {
  agotado: number;
  bajo: number;
  ok: number;
  total: number;
}

/** Counts of a batch of taps, for the confirmation line and the result screen. */
export function resumenReporte(items: ReadonlyArray<{ estado: FaltanteEstado }>): ResumenReporte {
  const r: ResumenReporte = { agotado: 0, bajo: 0, ok: 0, total: items.length };
  for (const it of items) r[it.estado] += 1;
  return r;
}

/** "2 agotados · 1 poco" — empty string when nothing is short. */
export function fraseFaltantes(counts: { agotado: number; bajo: number }): string {
  const parts: string[] = [];
  if (counts.agotado) parts.push(`${counts.agotado} agotado${counts.agotado === 1 ? "" : "s"}`);
  if (counts.bajo) parts.push(`${counts.bajo} poco`);
  return parts.join(" · ");
}
