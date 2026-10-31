/**
 * «Corregir» — the owner's one-sheet stock fix (docs/redesign/PLAN.md §6.3).
 *
 * The owner types how much there IS (the total, never a delta) and why it was
 * wrong. The reason decides what the kardex records, so a fix stops being an
 * anonymous «Ajuste manual»:
 *   · conte    «Conté»               → ajuste, note «Conteo»
 *   · danado   «Se dañó / venció»    → merma (stock can only go down)
 *   · compra   «Compra sin registrar» → import (stock can only go up), with an
 *                                       optional price that becomes the item's
 *                                       last cost
 *   · receta   «Error de receta»     → ajuste, note «Error de receta» (and the
 *                                       sheet links to the recipe to fix)
 * Pure: no I/O. The write lives in app/(admin)/inventario/actions.ts
 * (`corregirStock`); unit-tested in corregir.test.ts.
 */
import { unitCostFromPack } from "@/lib/cost";

export const MOTIVOS_CORRECCION = ["conte", "danado", "compra", "receta"] as const;
export type MotivoCorreccion = (typeof MOTIVOS_CORRECCION)[number];

export const MOTIVO_CORRECCION: Record<MotivoCorreccion, { label: string; hint: string }> = {
  conte: { label: "Conté", hint: "Lo contaste y hay otra cantidad" },
  danado: { label: "Se dañó / venció", hint: "Se botó: queda como merma" },
  compra: { label: "Compra sin registrar", hint: "Llegó mercancía que no entró por Pedidos" },
  receta: { label: "Error de receta", hint: "Las ventas descuentan de más o de menos" },
};

/** Note written on the movement for each reason (what the kardex shows). */
export const NOTA_CORRECCION: Record<MotivoCorreccion, string> = {
  conte: "Conteo",
  danado: "Merma · Se dañó o venció",
  compra: "Compra sin registrar",
  receta: "Error de receta",
};

/** Justification stored on the merma row (≥ 5 chars, required by the table). */
export const JUSTIFICACION_CORRECCION = "Corrección desde el inventario del dueño";

export type TipoMovimiento = "ajuste" | "merma" | "import";

export interface PlanCorreccion {
  type: TipoMovimiento;
  /** Signed change in the item's unit (nuevo − actual), 3 decimals. */
  delta: number;
  /** Cost per unit recorded on the movement. */
  unitCost: number;
  note: string;
  /** New last cost for the item (a priced purchase), or null to leave it. */
  recostear: number | null;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * What a correction writes, or why it can't. `actual` is the stock the system
 * has now, `nuevo` what the owner says there is (same unit), `precio` the
 * total paid for an unregistered purchase (optional).
 */
export function planCorreccion(input: {
  actual: number;
  nuevo: number | null;
  motivo: MotivoCorreccion | null;
  costoUnit: number;
  precio?: number | null;
  nota?: string | null;
}): { ok: true; plan: PlanCorreccion } | { ok: false; error: string } {
  const { actual, nuevo, motivo, costoUnit } = input;
  if (nuevo === null || !Number.isFinite(nuevo) || nuevo < 0) return { ok: false, error: "Escribe cuánto hay." };
  if (!motivo || !(MOTIVOS_CORRECCION as readonly string[]).includes(motivo)) return { ok: false, error: "Elige por qué cambia." };
  const delta = r3(nuevo - actual);
  if (delta === 0) return { ok: false, error: "Es la misma cantidad que ya tiene el sistema." };
  const extra = input.nota?.trim();
  const note = (extra ? `${NOTA_CORRECCION[motivo]} · ${extra}` : NOTA_CORRECCION[motivo]).slice(0, 200);
  const costo = Number.isFinite(costoUnit) && costoUnit > 0 ? costoUnit : 0;

  if (motivo === "danado") {
    if (delta > 0) return { ok: false, error: "Una merma solo baja el inventario: la cantidad nueva debe ser menor." };
    return { ok: true, plan: { type: "merma", delta, unitCost: costo, note, recostear: null } };
  }
  if (motivo === "compra") {
    if (delta < 0) return { ok: false, error: "Una compra solo sube el inventario: la cantidad nueva debe ser mayor." };
    const precio = input.precio != null && Number.isFinite(input.precio) && input.precio > 0 ? input.precio : null;
    const unitCost = precio != null ? unitCostFromPack(precio, delta) : costo;
    return { ok: true, plan: { type: "import", delta, unitCost, note, recostear: precio != null && unitCost !== costo ? unitCost : null } };
  }
  return { ok: true, plan: { type: "ajuste", delta, unitCost: costo, note, recostear: null } };
}

/**
 * Keypad text → stock units. «2,5» bolsas with a 900 ml piece → 2250 ml.
 * Null when it isn't a number. `pieza` = size of one piece in stock units
 * (lib/inventario/niveles `piezaDe`), null when typed in the unit itself.
 */
export function cantidadDesdeTeclado(texto: string, pieza: number | null): number | null {
  const t = texto.trim().replace(",", ".");
  if (!t || !/^\d+(\.\d*)?$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return r3(pieza && pieza > 1 ? n * pieza : n);
}

/** Stock units → keypad text in the unit being typed («2,5» bolsas). */
export function tecladoDesdeCantidad(qty: number, pieza: number | null): string {
  const v = pieza && pieza > 1 ? qty / pieza : qty;
  const r = Math.round(Math.max(0, v) * 100) / 100;
  return String(r).replace(".", ",");
}

/** Cost of the change at the item's cost (absolute, whole COP) — what the sheet shows. */
export function valorCambio(delta: number, costoUnit: number): number {
  return Math.round(Math.abs(delta) * (costoUnit > 0 ? costoUnit : 0));
}
