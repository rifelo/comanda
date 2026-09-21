/**
 * Pure helpers for the cup label the POS prints per drink (the "Café PA'YO"
 * design): how much coffee a recipe carries and the spec line that goes in
 * the box. No I/O — unit-tested in drink-label.test.ts.
 */

import type { OrderLine } from "./types";

/** One espresso shot, in grams (the menu's own wording: "1 SHOT · 9 G"). */
export const GRAMS_PER_SHOT = 9;

/** One job in the label run of a sale, in print order. */
export type SaleLabelJob =
  | { kind: "name"; name: string }
  | { kind: "instagram" }
  | { kind: "drink"; item: DrinkLabelPlanItem };

/**
 * The whole label run of a sale. Labels are for the cups the bar prepares:
 * with people on the ticket, each person who has at least one prepared
 * drink gets "Pa' <nombre>", the Instagram QR and their cups; someone with
 * only food or a bottle gets nothing. Cups that belong to nobody come last
 * behind the order label (table name or number) with their own QR. Without
 * people it is the order label (always — it is the pickup number), the QR
 * when there is a cup, and the cups. Phrases are not here: they wait on the
 * AI and are queued per cup when it answers.
 */
export function planSaleLabels(input: {
  order: ReadonlyArray<OrderLine>;
  people: ReadonlyArray<string>;
  byId: Readonly<Record<string, DrinkLabelProduct | undefined>>;
  /** Table / group label ("Mesa 3"), "" for none. */
  tableName: string;
  instagram: boolean;
}): SaleLabelJob[] {
  const cups = planDrinkLabels(input.order, input.people, input.byId);
  const jobs: SaleLabelJob[] = [];
  const group = (name: string, items: DrinkLabelPlanItem[], always: boolean) => {
    if (!items.length && !always) return;
    jobs.push({ kind: "name", name });
    if (input.instagram && items.length) jobs.push({ kind: "instagram" });
    for (const item of items) jobs.push({ kind: "drink", item });
  };
  if (input.people.length === 0) {
    group(input.tableName, cups, true);
    return jobs;
  }
  for (const who of input.people) group(who, cups.filter((c) => c.customer === who), false);
  group(input.tableName, cups.filter((c) => !c.customer || !input.people.includes(c.customer)), false);
  return jobs;
}

export interface DrinkLabelPlanItem {
  productId: string;
  name: string;
  spec?: string[];
  desc?: string;
  customer?: string;
}

/** What the planner needs to know about a product. */
export interface DrinkLabelProduct {
  name: string;
  desc?: string;
  spec?: string[];
  printsLabel?: boolean;
}

/**
 * The cup labels an order should print, in the order the barista wants
 * them: grouped by person (roster order), the unassigned lines last, lines
 * in ticket order inside each group. One entry per cup, capped per line
 * (a bulk order can't run the roll out) and overall. Food never prints.
 */
export function planDrinkLabels(
  order: ReadonlyArray<OrderLine>,
  people: ReadonlyArray<string>,
  byId: Readonly<Record<string, DrinkLabelProduct | undefined>>,
  caps: { perLine?: number; total?: number } = {},
): DrinkLabelPlanItem[] {
  const perLine = caps.perLine ?? 12;
  const total = caps.total ?? 24;
  const out: DrinkLabelPlanItem[] = [];
  // Names on lines but not on the roster still get their own group, after the roster.
  const extra = [...new Set(order.map((l) => l.customer ?? "").filter((c) => c && !people.includes(c)))];
  const groups: Array<string | null> = [...people, ...extra, null];
  for (const who of groups) {
    for (const line of order) {
      if (line.kind !== "item") continue;
      if ((line.customer ?? "") !== (who ?? "")) continue;
      const p = byId[line.id];
      if (!p?.printsLabel) continue;
      for (let i = 0; i < Math.min(line.qty, perLine); i++) {
        if (out.length >= total) return out;
        out.push({ productId: line.id, name: p.name, spec: p.spec, desc: p.desc, ...(who ? { customer: who } : {}) });
      }
    }
  }
  return out;
}

export interface RecipeLine {
  name: string;
  unit: string;
  qty: number;
}

/**
 * Grams of coffee in a recipe. Coffee is an ingredient measured in grams
 * whose name says so ("Cafe Okana"); milk, cups and syrups never match.
 */
export function coffeeGramsOf(lines: ReadonlyArray<RecipeLine>): number {
  return lines
    .filter((l) => l.unit === "g" && /caf[eé]/i.test(l.name))
    .reduce((g, l) => g + Number(l.qty || 0), 0);
}

/**
 * The spec box of the label: shots for espresso-based drinks, "TRADICIONAL"
 * for the tinto (brewed, not pulled) and "SIN CAFÉ" for everything else.
 * Derived from the recipe, so it follows whatever the kitchen actually uses.
 */
export function drinkSpec(input: { coffeeG: number; categoryLabel?: string | null }): string[] {
  if ((input.categoryLabel ?? "").trim().toLowerCase() === "tinto") return ["TRADICIONAL"];
  const g = Math.round(input.coffeeG);
  if (g <= 0) return ["SIN CAFÉ"];
  const shots = Math.max(1, Math.round(g / GRAMS_PER_SHOT));
  return [`${shots} SHOT${shots === 1 ? "" : "S"} · ${g} G`];
}
