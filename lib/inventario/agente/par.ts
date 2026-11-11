/**
 * Reorder point (PAR) of an inventory item, pure (tested in par.test.ts).
 *
 *   PAR = consumo diario × (días de entrega + días de seguridad)
 *
 * Items bought in bulk and rarely (a lot that lasts 30+ days, e.g. 5.000
 * cups every six months) are «masivos»: they keep a bigger safety stock (10
 * days instead of 3), are counted once a week by closed boxes instead of
 * every day, and when they fall under the PAR the suggestion is the whole
 * lot — never the exact difference.
 */

/** Days of consumption looked at. */
export const CONSUMO_VENTANA = 28;
/** Purchases looked at to learn the usual lot. */
export const LOTE_VENTANA = 180;
/** A lot that lasts at least this many days of consumption makes the item a bulk buy. */
export const MASIVO_DIAS = 30;
export const SEGURIDAD_NORMAL = 3;
export const SEGURIDAD_MASIVO = 10;
/** Normal items: suggest enough for the PAR plus this many days, rounded up to whole packs. */
export const COBERTURA_PEDIDO = 7;
/** Bulk items are counted (by closed boxes) every this many days. */
export const MASIVO_CONTEO_DIAS = 7;

export interface ParInput {
  /** Stock units consumed per selling day (sales + mermas). */
  consumoDiario: number;
  /** Supplier's delivery days; null = no supplier (1 is assumed). */
  entregaDias: number | null;
  /** Owner's override of the safety days; null = automatic. */
  diasSeguridad: number | null;
  /** What is usually bought at once; null = unknown. */
  lote: number | null;
  /** The purchase pack (pack_qty), to round normal suggestions. */
  pack: number | null;
  stock: number;
}

export interface ParResultado {
  masivo: boolean;
  entregaDias: number;
  seguridadDias: number;
  puntoReorden: number;
  coberturaDias: number | null;
  pedir: boolean;
  cantidadSugerida: number | null;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function esMasivo(consumoDiario: number, lote: number | null): boolean {
  return consumoDiario > 0 && lote != null && lote >= MASIVO_DIAS * consumoDiario;
}

export function calcularPar(i: ParInput): ParResultado {
  const masivo = esMasivo(i.consumoDiario, i.lote);
  const entregaDias = i.entregaDias ?? 1;
  const seguridadDias = i.diasSeguridad ?? (masivo ? SEGURIDAD_MASIVO : SEGURIDAD_NORMAL);
  const puntoReorden = r3(i.consumoDiario * (entregaDias + seguridadDias));
  const coberturaDias = i.consumoDiario > 0 ? Math.round((Math.max(i.stock, 0) / i.consumoDiario) * 10) / 10 : null;
  const pedir = i.consumoDiario > 0 && i.stock <= puntoReorden;
  let cantidadSugerida: number | null = null;
  if (pedir) {
    if (masivo && i.lote) {
      // The whole lot, as many as needed to get back over the PAR (usually one).
      const falta = puntoReorden - i.stock;
      cantidadSugerida = r3(Math.max(1, Math.ceil(falta / i.lote - 1e-9)) * i.lote);
    } else {
      const objetivo = puntoReorden + i.consumoDiario * COBERTURA_PEDIDO;
      const falta = objetivo - Math.max(i.stock, 0);
      const pack = i.pack && i.pack > 1 ? i.pack : null;
      cantidadSugerida = pack ? r3(Math.ceil(falta / pack - 1e-9) * pack) : r3(Math.ceil(falta - 1e-9));
    }
  }
  return { masivo, entregaDias, seguridadDias, puntoReorden, coberturaDias, pedir, cantidadSugerida };
}

/** The usual purchase: the median of the quantities bought at once. */
export function loteHabitual(compras: ReadonlyArray<number>): number | null {
  const xs = compras.filter((x) => x > 0).sort((a, b) => a - b);
  if (!xs.length) return null;
  const m = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[m] : r3((xs[m - 1] + xs[m]) / 2);
}
