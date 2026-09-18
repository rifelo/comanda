/**
 * Pure helpers for the cup label the POS prints per drink (the "Café PA'YO"
 * design): how much coffee a recipe carries and the spec line that goes in
 * the box. No I/O — unit-tested in drink-label.test.ts.
 */

/** One espresso shot, in grams (the menu's own wording: "1 SHOT · 9 G"). */
export const GRAMS_PER_SHOT = 9;

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
