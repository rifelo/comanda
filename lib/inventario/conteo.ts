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

/**
 * The order a count is walked in: by zone (where things physically are) when
 * the items have one, in the order given, with whatever has no zone at the
 * end; by category when no item has a zone yet. Counting shelf by shelf is
 * what keeps a full count under half an hour.
 */
export function groupForCount<T extends { category_id: string | null; ubicacion?: string | null }>(
  items: ReadonlyArray<T>,
  categorias: ReadonlyArray<{ id: string; label: string }>,
  zonas: ReadonlyArray<string>,
): { label: string; items: T[] }[] {
  const zoneOf = (i: T) => (i.ubicacion ?? "").trim();
  const groups: { label: string; items: T[] }[] = [];
  if (items.some((i) => zoneOf(i))) {
    const known = zonas.map((z) => z.toLowerCase());
    const seen = [...new Set(items.map(zoneOf).filter(Boolean))].sort((a, b) => {
      const ia = known.indexOf(a.toLowerCase()), ib = known.indexOf(b.toLowerCase());
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, "es");
    });
    for (const z of seen) groups.push({ label: z, items: items.filter((i) => zoneOf(i) === z) });
    const rest = items.filter((i) => !zoneOf(i));
    if (rest.length) groups.push({ label: "Sin zona", items: rest });
    return groups;
  }
  const label = new Map(categorias.map((c) => [c.id, c.label]));
  for (const cid of [...categorias.map((c) => c.id), null]) {
    const group = items.filter((i) => (i.category_id ?? null) === cid);
    if (group.length) groups.push({ label: cid ? label.get(cid) ?? "Otros" : "Sin categoría", items: group });
  }
  return groups;
}
