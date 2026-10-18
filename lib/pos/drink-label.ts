/**
 * Pure helpers for the cup label the POS prints per drink (the "Café PA'YO"
 * design): how much coffee a recipe carries and the spec line that goes in
 * the box. No I/O — unit-tested in drink-label.test.ts.
 */

import type { OrderLine } from "./types";

/** One espresso shot, in grams (the menu's own wording: "1 SHOT · 9 G"). */
export const GRAMS_PER_SHOT = 9;

/**
 * The line in the cup label's box: "+7 DE ENERGÍA", a number from 1 to 10
 * drawn fresh for every cup. It replaced the recipe's shots and grams
 * ("1 SHOT · 9 G") — a wink for the customer, not a measurement.
 */
export function energiaLine(rand: number = Math.random()): string {
  const n = Math.min(10, Math.max(1, 1 + Math.floor(rand * 10)));
  return `+${n} DE ENERGÍA`;
}

/** Labels every prepared drink carries: name, rating QR, the drink, its phrase. */
export const LABELS_PER_DRINK = 4;

/** One job in the label run of a sale, in print order. */
export type SaleLabelJob =
  | { kind: "name"; name: string }
  /**
   * The rating QR of one cup ("" customer = the table / the whole order).
   * `line` is the cup's ticket line, so the QR is worth that drink; the
   * person's first cup (`resto`) also carries what has no label (food, bottles).
   */
  | { kind: "califica"; customer: string; line: number; resto: boolean }
  | { kind: "drink"; item: DrinkLabelPlanItem }
  /** The AI phrase about this cup's drink — printed when it answers. */
  | { kind: "frase"; productId: string };

/**
 * The whole label run of a sale. Every prepared drink gets the same four
 * labels, one after the other so each cup's set comes out together: its
 * name ("Pa' <nombre>", or the table / order label), its rating QR, the
 * drink label and its phrase — whether it is alone or one of ten in the
 * order. Sets follow the roster order, cups that belong to nobody last.
 * Someone with only food or a bottle gets nothing; an order with no drink
 * at all still gets its order label (it is the pickup number).
 */
export function planSaleLabels(input: {
  order: ReadonlyArray<OrderLine>;
  people: ReadonlyArray<string>;
  byId: Readonly<Record<string, DrinkLabelProduct | undefined>>;
  /** Table / group label ("Mesa 3"), "" for none. */
  tableName: string;
}): SaleLabelJob[] {
  const cups = planDrinkLabels(input.order, input.people, input.byId);
  const jobs: SaleLabelJob[] = [];
  const group = (name: string, items: DrinkLabelPlanItem[], always: boolean) => {
    if (!items.length) {
      if (always) jobs.push({ kind: "name", name });
      return;
    }
    const customer = input.people.includes(name) ? name : "";
    items.forEach((item, i) => {
      jobs.push({ kind: "name", name });
      jobs.push({ kind: "califica", customer, line: item.line, resto: i === 0 });
      jobs.push({ kind: "drink", item });
      jobs.push({ kind: "frase", productId: item.productId });
    });
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
  /** Index of the ticket line the cup comes from (= orden_items.position). */
  line: number;
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
    for (const [idx, line] of order.entries()) {
      if (line.kind !== "item") continue;
      if ((line.customer ?? "") !== (who ?? "")) continue;
      const p = byId[line.id];
      if (!p?.printsLabel) continue;
      for (let i = 0; i < Math.min(line.qty, perLine); i++) {
        if (out.length >= total) return out;
        out.push({ productId: line.id, line: idx, name: p.name, spec: p.spec, desc: p.desc, ...(who ? { customer: who } : {}) });
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
