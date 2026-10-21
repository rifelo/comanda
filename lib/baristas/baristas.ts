/**
 * Drinks made per barista and the ratings their cups got. The POS credits
 * every order to the barista on the bar (ordenes.barista_id, 0057); a
 * prepared drink is anything that prints a cup label (the same rule as the
 * POS). Pure helpers — periods and totals; unit-tested in baristas.test.ts.
 * The reads live in baristas-db.ts.
 */

export const PERIODOS = ["hoy", "semana", "mes"] as const;
export type Periodo = (typeof PERIODOS)[number];
export const PERIODO_LABEL: Record<Periodo, string> = { hoy: "Hoy", semana: "Esta semana", mes: "Este mes" };

export function parsePeriodo(v: string | undefined): Periodo {
  return (PERIODOS as readonly string[]).includes(v ?? "") ? (v as Periodo) : "semana";
}

/** Inclusive days (YYYY-MM-DD) of a period ending today; the week starts on Monday. */
export function rangoPeriodo(periodo: Periodo, hoy: string): { desde: string; hasta: string } {
  if (periodo === "hoy") return { desde: hoy, hasta: hoy };
  if (periodo === "mes") return { desde: hoy.slice(0, 8) + "01", hasta: hoy };
  const d = new Date(hoy + "T12:00:00Z");
  const lunes = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - lunes);
  return { desde: d.toISOString().slice(0, 10), hasta: hoy };
}

export interface OrdenBarista {
  id: string;
  baristaId: string | null;
  items: { productoId: string | null; comboId: string | null; qty: number }[];
}
export interface CalificacionBarista {
  ordenId: string;
  estrellas: number;
}
export interface FilaBarista {
  /** null = orders nobody was credited for. */
  id: string | null;
  name: string;
  bebidas: number;
  pedidos: number;
  calificadas: number;
  promedio: number | null;
  /** Count of 1★ … 5★ (index 0 = 1★). */
  estrellas: [number, number, number, number, number];
}

/**
 * One row per barista with drinks in the period (most drinks first), plus a
 * «Sin barista» row when some orders weren't credited. A combo counts the
 * drinks inside it. An order without drinks doesn't count as theirs.
 */
export function resumenBaristas(
  ordenes: readonly OrdenBarista[],
  esBebida: (productoId: string) => boolean,
  bebidasDeCombo: (comboId: string) => number,
  calificaciones: readonly CalificacionBarista[],
  nombre: (baristaId: string) => string,
): FilaBarista[] {
  const filas = new Map<string | null, FilaBarista>();
  const deOrden = new Map<string, string | null>();
  for (const o of ordenes) {
    let bebidas = 0;
    for (const it of o.items) {
      if (it.productoId && esBebida(it.productoId)) bebidas += it.qty;
      else if (it.comboId) bebidas += bebidasDeCombo(it.comboId) * it.qty;
    }
    if (!bebidas) continue;
    deOrden.set(o.id, o.baristaId);
    const f = filas.get(o.baristaId) ?? {
      id: o.baristaId,
      name: o.baristaId ? nombre(o.baristaId) : "Sin barista",
      bebidas: 0,
      pedidos: 0,
      calificadas: 0,
      promedio: null,
      estrellas: [0, 0, 0, 0, 0],
    };
    f.bebidas += bebidas;
    f.pedidos += 1;
    filas.set(o.baristaId, f);
  }
  for (const c of calificaciones) {
    if (!deOrden.has(c.ordenId) || c.estrellas < 1 || c.estrellas > 5) continue;
    const f = filas.get(deOrden.get(c.ordenId) ?? null)!;
    f.calificadas += 1;
    f.estrellas[c.estrellas - 1] += 1;
  }
  for (const f of filas.values()) {
    f.promedio = f.calificadas ? f.estrellas.reduce((s, n, i) => s + n * (i + 1), 0) / f.calificadas : null;
  }
  return [...filas.values()].sort((a, b) => (a.id === null ? 1 : b.id === null ? -1 : b.bebidas - a.bebidas || a.name.localeCompare(b.name, "es")));
}
