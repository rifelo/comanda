/**
 * The inventory routine, pure (no I/O; tested in rutina.test.ts): which count
 * the closing turno owes today, and when a quick count is ordinary enough to
 * correct the stock without waiting for the owner.
 *
 * Quick count every night; the full one on a fixed weekday (lun = 0 … dom = 6,
 * the convention of the rest of the system) in place of that night's quick one.
 */
import { fullCountDue, lineDiff, type ConteoKind, type ConteoLine } from "./conteo";

export const DIAS_LARGOS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"] as const;

export interface Rutina {
  /** The count the closing turno owes today. */
  toca: ConteoKind;
  /** It was already sent today (a full count also covers the quick one). */
  hecho: boolean;
  /** The weekly full count was skipped: its day went by and the last one is over a week old. */
  completoAtrasado: boolean;
  /** Days since the last full count; null = never done. */
  diasDesdeCompleto: number | null;
}

export function rutinaHoy(input: {
  todayIdx: number;
  completoDia: number;
  /** Kinds of the non-rejected counts sent today. */
  kindsHoy: ReadonlyArray<ConteoKind>;
  lastCompletoAt: string | null;
  now?: Date;
}): Rutina {
  const toca: ConteoKind = input.todayIdx === input.completoDia ? "completo" : "diario";
  const hecho = input.kindsHoy.includes("completo") || (toca === "diario" && input.kindsHoy.includes("diario"));
  const due = fullCountDue(input.lastCompletoAt, input.now);
  return { toca, hecho, completoAtrasado: toca === "diario" && due.due, diasDesdeCompleto: due.days };
}

export const NOMBRE_CONTEO: Record<ConteoKind, string> = { diario: "Conteo rápido", completo: "Conteo completo" };

/** A line is ordinary within one piece or this share of what was expected, whichever is larger. */
export const TOLERANCIA_PCT = 0.1;
/** …and the whole count within this much money, adding shortages and surpluses. */
export const TOLERANCIA_VALOR_COP = 30_000;

export interface LineaNormal extends ConteoLine {
  /** Stock units in the piece the item is counted in; null = counted in its unit. */
  pieza: number | null;
}

/**
 * Whether a quick count can correct the stock by itself: every difference is
 * the size of a counting slip (a bag more or less, a few grams) and the lot is
 * worth little. A negative expected stock is never ordinary — the system was
 * already wrong before anyone counted.
 */
export function conteoNormal(lines: ReadonlyArray<LineaNormal>): boolean {
  let valor = 0;
  for (const l of lines) {
    if (l.expected < 0) return false;
    const { diff, value } = lineDiff(l);
    const margen = Math.max(l.pieza && l.pieza > 0 ? l.pieza : 1, Math.abs(l.expected) * TOLERANCIA_PCT);
    if (Math.abs(diff) > margen + 1e-9) return false;
    valor += Math.abs(value);
  }
  return valor <= TOLERANCIA_VALOR_COP;
}

/** The turno that closes the day: the one that ends last. */
export function esTurnoDeCierre(fin: string, fines: ReadonlyArray<string>): boolean {
  return fines.every((f) => f <= fin);
}
