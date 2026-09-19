/**
 * Pure helpers for the end-of-shift stock count (no I/O; unit-tested in
 * conteo.test.ts): which items a count covers, how a counted line compares
 * with what the system expected, and the totals the owner reviews.
 */

export type ConteoKind = "diario" | "completo";

export interface CountableIngrediente {
  id: string;
  name: string;
  unit: string;
  category_id: string | null;
  conteo_diario: boolean;
  archived?: boolean;
}

/** Items a count of `kind` covers: the short daily list, or everything active. */
export function pickCountList<T extends CountableIngrediente>(items: ReadonlyArray<T>, kind: ConteoKind): T[] {
  return items.filter((i) => !i.archived && (kind === "completo" || i.conteo_diario));
}

/** "12", "12,5", " 3.25 " → number; anything else → null. Tablet keyboards type commas. */
export function parseCount(text: string): number | null {
  const t = text.trim().replace(",", ".");
  if (!t) return null;
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : null;
}

export interface ConteoLine {
  expected: number;
  counted: number;
  unit_cost_cop: number;
}
/** Difference of one line (counted − expected) and what it is worth. */
export function lineDiff(l: ConteoLine): { diff: number; value: number } {
  const diff = Math.round((l.counted - l.expected) * 1000) / 1000;
  return { diff, value: Math.round(diff * l.unit_cost_cop) };
}

export interface ConteoSummary {
  lines: number;
  withDiff: number;
  /** Sum of every line's value (negative = missing stock). */
  netValue: number;
  /** Value of what is missing (positive number). */
  shortValue: number;
  /** Value of what is over (positive number). */
  overValue: number;
}
export function conteoSummary(lines: ReadonlyArray<ConteoLine>): ConteoSummary {
  let withDiff = 0, netValue = 0, shortValue = 0, overValue = 0;
  for (const l of lines) {
    const { diff, value } = lineDiff(l);
    if (diff !== 0) withDiff += 1;
    netValue += value;
    if (value < 0) shortValue += -value;
    else overValue += value;
  }
  return { lines: lines.length, withDiff, netValue, shortValue, overValue };
}

/** A full count is due weekly; null = never done. */
export function fullCountDue(lastCompletoAt: string | null, now: Date = new Date()): { due: boolean; days: number | null } {
  if (!lastCompletoAt) return { due: true, days: null };
  const days = Math.floor((now.getTime() - new Date(lastCompletoAt).getTime()) / 86_400_000);
  return { due: days >= 7, days };
}
