/**
 * Pure helpers for combining pending orders (no I/O; unit-tested in
 * combinar.test.ts): which order should receive the others by default, and
 * what the combined order will look like before the cashier confirms.
 */
import type { PosOrder } from "./types";

/** "A-73" → 73 (0 when the folio has no number). */
export function folioNumber(folio: string): number {
  const m = /(\d+)\s*$/.exec(folio);
  return m ? Number(m[1]) : 0;
}

/** The oldest folio among the selection keeps its number; the rest fold into it. */
export function defaultMergeTarget(orders: ReadonlyArray<Pick<PosOrder, "id" | "folio">>): string | null {
  if (!orders.length) return null;
  return [...orders].sort((a, b) => folioNumber(a.folio) - folioNumber(b.folio))[0].id;
}

export interface MergePreview {
  targetFolio: string;
  sourceFolios: string[];
  people: string[];
  items: number;
  total: number;
  paid: number;
  remaining: number;
}

/** What the target will hold once the sources fold into it (mirrors the SQL). */
export function mergePreview(target: PosOrder, sources: ReadonlyArray<PosOrder>): MergePreview {
  const people: string[] = [];
  const seen = new Set<string>();
  const push = (n: string) => {
    const k = n.trim().toLocaleLowerCase();
    if (!k || seen.has(k)) return;
    seen.add(k);
    people.push(n.trim());
  };
  target.customerNames.forEach(push);
  for (const s of sources) s.customerNames.forEach(push);
  const all = [target, ...sources];
  const total = all.reduce((n, o) => n + o.total, 0);
  const paid = all.reduce((n, o) => n + o.paid, 0);
  return {
    targetFolio: target.folio,
    sourceFolios: sources.map((s) => s.folio),
    people,
    items: all.reduce((n, o) => n + o.items.reduce((m, it) => m + it.qty, 0), 0),
    total,
    paid,
    remaining: Math.max(0, total - paid),
  };
}
