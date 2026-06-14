/**
 * Pure helpers + types for the Modificadores module. No I/O — the summary is
 * unit-tested in modificadores.test.ts; the DB fetch lives in
 * lib/db/modificadores.ts.
 */

export type ModGroupType = "single" | "multiple";

export interface ModOption {
  id: string;
  name: string;
  price_delta_cop: number;
  available: boolean;
}

export interface ModGroup {
  id: string;
  name: string;
  type: ModGroupType;
  required: boolean;
  options: ModOption[];
}

export interface GroupSummary {
  total: number;
  available: number;
  minDelta: number;
  maxDelta: number;
}

/** Counts + price-delta range over a group's options. */
export function summarizeGroup(
  options: ReadonlyArray<Pick<ModOption, "price_delta_cop" | "available">>,
): GroupSummary {
  const available = options.filter((o) => o.available).length;
  const deltas = options.map((o) => o.price_delta_cop);
  return {
    total: options.length,
    available,
    minDelta: deltas.length ? Math.min(...deltas) : 0,
    maxDelta: deltas.length ? Math.max(...deltas) : 0,
  };
}
