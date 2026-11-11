/**
 * Reorder point (ROP) and PAR level of an inventory item, pure (tested in par.test.ts).
 *
 *   ROP = consumo diario × días de entrega + stock de seguridad      → WHEN to order (trigger)
 *   PAR = consumo diario × (días de entrega + días entre pedidos) + stock de seguridad
 *                                                                    → UP TO how much (target)
 *   stock de seguridad = consumo diario × días de seguridad
 *
 * Days between orders come from the supplier's fixed order days (Mon + Thu →
 * the longest gap, 4); without them a weekly order is assumed.
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
/** Days between orders assumed when the supplier has no fixed order days. */
export const CICLO_DEFAULT = 7;
/** Bulk items are counted (by closed boxes) every this many days. */
export const MASIVO_CONTEO_DIAS = 7;

export interface ParInput {
  /** Stock units consumed per selling day (sales + mermas). */
  consumoDiario: number;
  /** Supplier's delivery days; null = no supplier (1 is assumed). */
  entregaDias: number | null;
  /** Supplier's fixed order weekdays (lun = 0 … dom = 6); null/empty = weekly assumed. */
  diasPedido?: ReadonlyArray<number> | null;
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
  /** Days between two orders to the supplier. */
  cicloDias: number;
  /** ROP: order when the stock reaches this. */
  puntoReorden: number;
  /** PAR: the level an order fills up to. */
  parNivel: number;
  coberturaDias: number | null;
  pedir: boolean;
  cantidadSugerida: number | null;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function esMasivo(consumoDiario: number, lote: number | null): boolean {
  return consumoDiario > 0 && lote != null && lote >= MASIVO_DIAS * consumoDiario;
}

/** Longest gap (days) between the supplier's order weekdays; CICLO_DEFAULT without them. */
export function cicloDias(diasPedido: ReadonlyArray<number> | null | undefined): number {
  const d = [...new Set((diasPedido ?? []).filter((x) => x >= 0 && x <= 6))].sort((a, b) => a - b);
  if (!d.length) return CICLO_DEFAULT;
  if (d.length === 1) return 7;
  let max = 0;
  for (let k = 0; k < d.length; k++) max = Math.max(max, (d[(k + 1) % d.length] - d[k] + 7) % 7 || 7);
  return max;
}

export function calcularPar(i: ParInput): ParResultado {
  const masivo = esMasivo(i.consumoDiario, i.lote);
  const entregaDias = i.entregaDias ?? 1;
  const seguridadDias = i.diasSeguridad ?? (masivo ? SEGURIDAD_MASIVO : SEGURIDAD_NORMAL);
  const ciclo = cicloDias(i.diasPedido);
  const puntoReorden = r3(i.consumoDiario * (entregaDias + seguridadDias));
  // Bulk items fill up with a whole lot: their target is the ROP plus one lot.
  const parNivel = masivo && i.lote ? r3(puntoReorden + i.lote) : r3(i.consumoDiario * (entregaDias + ciclo + seguridadDias));
  const coberturaDias = i.consumoDiario > 0 ? Math.round((Math.max(i.stock, 0) / i.consumoDiario) * 10) / 10 : null;
  const pedir = i.consumoDiario > 0 && i.stock <= puntoReorden;
  let cantidadSugerida: number | null = null;
  if (pedir) {
    if (masivo && i.lote) {
      // The whole lot, as many as needed to get back over the PAR (usually one).
      const falta = puntoReorden - i.stock;
      cantidadSugerida = r3(Math.max(1, Math.ceil(falta / i.lote - 1e-9)) * i.lote);
    } else {
      const falta = parNivel - Math.max(i.stock, 0);
      const pack = i.pack && i.pack > 1 ? i.pack : null;
      cantidadSugerida = pack ? r3(Math.ceil(falta / pack - 1e-9) * pack) : r3(Math.ceil(falta - 1e-9));
    }
  }
  return { masivo, entregaDias, seguridadDias, cicloDias: ciclo, puntoReorden, parNivel, coberturaDias, pedir, cantidadSugerida };
}

/** The usual purchase: the median of the quantities bought at once. */
export function loteHabitual(compras: ReadonlyArray<number>): number | null {
  const xs = compras.filter((x) => x > 0).sort((a, b) => a - b);
  if (!xs.length) return null;
  const m = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[m] : r3((xs[m - 1] + xs[m]) / 2);
}

/** History needed before the consumption number means something. */
export const MIN_DIAS_VENTA = 14;
/** A count older than this no longer vouches for the stock (low rotation gets twice as long). */
export const VERIFICADO_DIAS = 7;

export type Confiabilidad = "alta" | "media" | "baja" | "sin_datos";

export interface ConfiabilidadInput {
  consumoDiario: number;
  /** Selling days of the café in the consumption window. */
  diasConVenta: number;
  /** Days since the item was last counted; null = never. */
  diasSinContar: number | null;
  stock: number;
  sinProveedor: boolean;
  bajaRotacion: boolean;
  /** A count line of this item waits for a second review. */
  revisionPendiente: boolean;
}

/**
 * How far an item's PAR can be trusted. Four checks — the stock was verified
 * recently and isn't negative, the lead time comes from a real supplier,
 * there is enough sales history, no count waits for review — each one that
 * fails lowers it a level: none → alta, one → media, two or more → baja.
 * No consumption → sin_datos (there is no PAR to trust).
 */
export function confiabilidadPar(i: ConfiabilidadInput): { nivel: Confiabilidad; faltan: string[] } {
  if (i.consumoDiario <= 0) return { nivel: "sin_datos", faltan: ["Sin consumo en los últimos 28 días"] };
  const faltan: string[] = [];
  const limite = i.bajaRotacion ? VERIFICADO_DIAS * 2 : VERIFICADO_DIAS;
  if (i.diasSinContar === null) faltan.push("Nunca se ha contado");
  else if (i.diasSinContar > limite) faltan.push(`Sin contar hace ${i.diasSinContar} días`);
  else if (i.stock < 0) faltan.push("El stock está en negativo");
  if (i.sinProveedor) faltan.push("Sin proveedor: se asumen 1 día de entrega y pedido semanal");
  if (i.diasConVenta < MIN_DIAS_VENTA) faltan.push(`Solo ${i.diasConVenta} días de ventas (mínimo ${MIN_DIAS_VENTA})`);
  if (i.revisionPendiente) faltan.push("Conteo esperando segunda revisión");
  const nivel: Confiabilidad = faltan.length === 0 ? "alta" : faltan.length === 1 ? "media" : "baja";
  return { nivel, faltan };
}
