/**
 * Preparaciones de la casa (crema chantilly, jarabe simple…): an insumo with
 * a yield per batch («rinde») and the ingredients one batch takes. Pure
 * helpers — the DB side is preparaciones-db.ts; the batch itself is the SQL
 * function registrar_tanda (mig 0082).
 */

export interface LineaPreparacion {
  ingredienteId: string;
  name: string;
  unit: string;
  /** Per batch, in the ingredient's unit. */
  qty: number;
  /** Ingredient cost per unit. */
  costo: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** What one batch costs: Σ qty × cost. */
export function costoTanda(lineas: ReadonlyArray<Pick<LineaPreparacion, "qty" | "costo">>): number {
  return r2(lineas.reduce((a, l) => a + l.qty * l.costo, 0));
}

/** Cost per unit of the preparación (batch cost ÷ yield); 0 without a yield. */
export function costoPorUnidad(lineas: ReadonlyArray<Pick<LineaPreparacion, "qty" | "costo">>, rinde: number): number {
  return rinde > 0 ? r2(costoTanda(lineas) / rinde) : 0;
}

/** Why a preparación can't be saved, or null. `preparaciones` = ids of other preparaciones (no nesting). */
export function errorPreparacion(p: {
  id: string;
  rinde: number;
  lineas: ReadonlyArray<{ ingredienteId: string; qty: number }>;
  preparaciones: ReadonlySet<string>;
}): string | null {
  if (!(p.rinde > 0)) return "Escribe cuánto sale de una tanda.";
  if (!p.lineas.length) return "Agrega al menos un ingrediente.";
  const vistos = new Set<string>();
  for (const l of p.lineas) {
    if (l.ingredienteId === p.id) return "Una preparación no puede llevarse a sí misma.";
    if (p.preparaciones.has(l.ingredienteId)) return "Un ingrediente no puede ser otra preparación.";
    if (vistos.has(l.ingredienteId)) return "Hay un ingrediente repetido.";
    if (!(l.qty > 0)) return "Cada ingrediente necesita una cantidad mayor que 0.";
    vistos.add(l.ingredienteId);
  }
  return null;
}

/** "1", "1,5", "2" — batches as the team reads them. */
export function fmtTandas(n: number): string {
  return String(Math.round(n * 100) / 100).replace(".", ",");
}
