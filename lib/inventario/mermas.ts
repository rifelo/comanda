/**
 * Mermas — what is lost without being sold (a drink that fell, a cake that
 * went bad, an expired bag of milk). Pure helpers: the reasons, what a merma
 * takes out of the inventory and what it cost. No I/O — unit-tested in
 * mermas.test.ts; the writes live in app/turno/inventario/merma/actions.ts.
 */

export const MOTIVOS_MERMA = ["se_cayo", "danado", "vencido", "mal_preparado", "otro"] as const;
export type MotivoMerma = (typeof MOTIVOS_MERMA)[number];

export const MOTIVO_MERMA: Record<MotivoMerma, { label: string; hint: string }> = {
  se_cayo: { label: "Se cayó", hint: "Se cayó o se derramó" },
  danado: { label: "Se dañó", hint: "Se dañó, se cortó o se quemó" },
  vencido: { label: "Vencido", hint: "Pasó la fecha o ya no está bueno" },
  mal_preparado: { label: "Mal preparado", hint: "Hubo que rehacerlo o el cliente lo devolvió" },
  otro: { label: "Otro", hint: "Cuéntalo en la justificación" },
};

/** The shortest justification that says something ("se cayó" alone is the reason, not the why). */
export const JUSTIFICACION_MIN = 5;

/** One line of a product's recipe, with the ingredient's unit cost. */
export interface LineaReceta {
  ingredienteId: string;
  qty: number;
  costo: number;
}

/** One stock movement a merma writes (delta is negative). */
export interface SalidaMerma {
  ingredienteId: string;
  delta: number;
  costoUnitario: number;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * What a merma takes out: the whole recipe × qty for a product, the qty itself
 * for an ingredient. Lines of the same ingredient are merged; cost is
 * Σ round(qty × unit cost), the same rule as a recipe's cost (lib/cost.ts).
 */
export function salidasMerma(
  input: { kind: "producto"; receta: ReadonlyArray<LineaReceta>; qty: number } | { kind: "insumo"; ingredienteId: string; costo: number; qty: number },
): { salidas: SalidaMerma[]; costo: number } {
  if (input.kind === "insumo") {
    const delta = -r3(input.qty);
    return { salidas: [{ ingredienteId: input.ingredienteId, delta, costoUnitario: input.costo }], costo: Math.round(input.qty * input.costo) };
  }
  const by = new Map<string, SalidaMerma>();
  for (const l of input.receta) {
    if (!(l.qty > 0)) continue;
    const prev = by.get(l.ingredienteId);
    const delta = r3((prev?.delta ?? 0) - l.qty * input.qty);
    by.set(l.ingredienteId, { ingredienteId: l.ingredienteId, delta, costoUnitario: l.costo });
  }
  const salidas = [...by.values()];
  const costo = salidas.reduce((n, s) => n + Math.round(-s.delta * s.costoUnitario), 0);
  return { salidas, costo };
}

/** Why a merma can't be saved yet, or null when it can. */
export function errorMerma(input: { qty: number | null; motivo: string | null; justificacion: string; producto?: boolean }): string | null {
  if (input.qty === null || !(input.qty > 0)) return "Escribe cuánto se perdió.";
  if (input.producto && !Number.isInteger(input.qty)) return "Las bebidas y productos van en unidades enteras.";
  if (!input.motivo || !(MOTIVOS_MERMA as readonly string[]).includes(input.motivo)) return "Elige qué pasó.";
  if (input.justificacion.trim().length < JUSTIFICACION_MIN) return "Cuenta brevemente qué pasó (la justificación es obligatoria).";
  return null;
}

/** Totals for the owner: cost and count, by reason and by person (largest cost first). */
export function resumenMermas(rows: ReadonlyArray<{ motivo: MotivoMerma; costo: number; reportedBy: string | null }>): {
  n: number;
  costo: number;
  porMotivo: { motivo: MotivoMerma; n: number; costo: number }[];
  porPersona: { quien: string; n: number; costo: number }[];
} {
  const motivos = new Map<MotivoMerma, { n: number; costo: number }>();
  const personas = new Map<string, { n: number; costo: number }>();
  let costo = 0;
  for (const r of rows) {
    costo += r.costo;
    const m = motivos.get(r.motivo) ?? { n: 0, costo: 0 };
    motivos.set(r.motivo, { n: m.n + 1, costo: m.costo + r.costo });
    const who = r.reportedBy ?? "Sin nombre";
    const p = personas.get(who) ?? { n: 0, costo: 0 };
    personas.set(who, { n: p.n + 1, costo: p.costo + r.costo });
  }
  const byCost = <T extends { costo: number; n: number }>(a: T, b: T) => b.costo - a.costo || b.n - a.n;
  return {
    n: rows.length,
    costo: Math.round(costo),
    porMotivo: [...motivos].map(([motivo, v]) => ({ motivo, ...v })).sort(byCost),
    porPersona: [...personas].map(([quien, v]) => ({ quien, ...v })).sort(byCost),
  };
}
