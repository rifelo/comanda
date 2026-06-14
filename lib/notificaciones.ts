/**
 * Pure builder for the Notificaciones (stock alerts) view. Turns ingredientes
 * + categorías into alert rows ranked by severity, with summary counts.
 * No I/O — unit-tested in notificaciones.test.ts.
 */
import { stockLevel, type StockLevel } from "@/lib/cost";

export interface AlertaIngrediente {
  id: string;
  name: string;
  unit: string;
  category_id: string | null;
  stock_current: number;
  stock_min: number;
}

export interface CategoriaLite {
  id: string;
  parent_id: string | null;
  label: string;
}

export interface AlertaRow {
  id: string;
  name: string;
  unit: string;
  category_label: string | null;
  stock_current: number;
  stock_min: number;
  level: StockLevel;
}

export interface AlertasView {
  rows: AlertaRow[];
  counts: { sin: number; bajo: number; ok: number; total: number };
}

const SEVERITY: Record<StockLevel, number> = { sin: 0, bajo: 1, ok: 2 };

export function buildAlertas(
  ingredientes: ReadonlyArray<AlertaIngrediente>,
  categorias: ReadonlyArray<CategoriaLite>,
): AlertasView {
  const catById = new Map(categorias.map((c) => [c.id, c]));
  const labelFor = (categoryId: string | null): string | null => {
    if (!categoryId) return null;
    const c = catById.get(categoryId);
    if (!c) return null;
    const parent = c.parent_id ? catById.get(c.parent_id) : null;
    return parent ? `${parent.label} · ${c.label}` : c.label;
  };

  const rows: AlertaRow[] = ingredientes.map((i) => ({
    id: i.id,
    name: i.name,
    unit: i.unit,
    category_label: labelFor(i.category_id),
    stock_current: i.stock_current,
    stock_min: i.stock_min,
    level: stockLevel(i.stock_current, i.stock_min),
  }));

  // Most urgent first; ties broken alphabetically for a stable order.
  rows.sort(
    (a, b) =>
      SEVERITY[a.level] - SEVERITY[b.level] || a.name.localeCompare(b.name),
  );

  const counts = { sin: 0, bajo: 0, ok: 0, total: rows.length };
  for (const r of rows) counts[r.level] += 1;

  return { rows, counts };
}
