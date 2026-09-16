/** Puesto colour token → CSS colour. Indigo is a literal: no theme var maps to it. */
export const PUESTO_COLORS: Record<string, string> = {
  ink: "var(--ink)",
  red: "var(--red)",
  green: "var(--green)",
  amber: "var(--amber)",
  indigo: "#4b57a8",
};
export function puestoColor(token: string | null | undefined): string {
  return PUESTO_COLORS[token ?? "ink"] ?? "var(--ink)";
}
