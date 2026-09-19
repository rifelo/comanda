/**
 * Pure cart helpers (no React, no store). Unit-tested in cart.test.ts.
 */
import type { ModSelection, OrderLine } from "./types";

/**
 * Index of the ticket line a new tap should merge into, or -1.
 *
 * A line only absorbs a twin: same product, same modifiers and the same
 * person at the table. The person is part of the key on purpose — Juan's
 * latte and María's latte must stay two lines, or the cup labels can't tell
 * whose is whose. Combos never merge, and a `missing` snapshot line never
 * absorbs a live tap.
 */
export function findMergeIndex(
  order: ReadonlyArray<OrderLine>,
  cand: { id: string; kind: "item" | "combo"; mods?: ModSelection; customer?: string | null },
): number {
  if (cand.kind !== "item") return -1;
  const key = JSON.stringify(cand.mods ?? {});
  const who = cand.customer ?? "";
  return order.findIndex(
    (l) =>
      l.kind === "item" &&
      !l.missing &&
      l.id === cand.id &&
      (l.customer ?? "") === who &&
      JSON.stringify(l.mods ?? {}) === key,
  );
}
