/**
 * «Hoy en ventas» (/pos/ventas) — the team-facing numbers of a period: what
 * was sold, how many orders, average ticket, sales by hour, units by
 * product, how people paid and who sold. Pure (no I/O, unit-tested in
 * ventas.test.ts): the server runs it over the stored orders, and offline the
 * register runs it over the sales this device made.
 *
 * Same rules as the owner's /numeros: a sale is an order CREATED in the
 * period and already paid. Combined orders (cancelled into another one,
 * `mergedInto`) are not cancellations — their lines live on in the target.
 * Times are Bogotá (UTC−5, no DST), like the rest of the POS.
 */

export type VentasPeriodo = "hoy" | "ayer" | "semana";
export const VENTAS_PERIODOS: readonly VentasPeriodo[] = ["hoy", "ayer", "semana"];

export type VentaMetodo = "efectivo" | "transferencia" | "datafono";
export const VENTA_METODOS: readonly VentaMetodo[] = ["efectivo", "transferencia", "datafono"];

/** The slice of an order the summary needs (server rows and local outbox jobs map to this). */
export interface VentaOrden {
  id: string;
  status: "pagada" | "pendiente" | "cancelada";
  total: number;
  /** ISO instant the order was created (confirmed at the register). */
  createdAt: string;
  /** The order's own method (direct «Cobrar» sales write no payment rows). */
  method: string | null;
  /** Folded into another order by «Combinar» (status cancelada, not a cancellation). */
  merged: boolean;
  /** Person in session who rang it up. */
  createdBy: string | null;
  items: Array<{ key: string; name: string; qty: number }>;
  /** Payment rows (split / mixed payments); empty for a direct sale. */
  pagos: Array<{ method: string; amount: number }>;
}

export interface VentaHora {
  hora: number;
  total: number;
  pedidos: number;
}

export interface VentaProducto {
  key: string;
  name: string;
  qty: number;
}

export interface VentaPago {
  method: VentaMetodo;
  count: number;
  amount: number;
}

export interface VentaPersona {
  id: string | null;
  pedidos: number;
  total: number;
  /** First sale of the period (ISO). */
  desde: string;
}

export interface ResumenVentas {
  periodo: VentasPeriodo;
  vendido: number;
  /** Orders that count (paid + unpaid); cancellations are apart. */
  pedidos: number;
  pagadas: number;
  cancelados: number;
  sinPagar: number;
  /** vendido / pagadas (0 when nothing was paid). */
  ticket: number;
  /** Units per paid order. */
  itemsPorPedido: number;
  horas: VentaHora[];
  /** Current Bogotá hour while the period is today; null otherwise. */
  horaActual: number | null;
  productos: VentaProducto[];
  pagos: VentaPago[];
  personas: VentaPersona[];
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const OFFSET = 5 * HOUR; // Bogotá = UTC−5

/** YYYY-MM-DD in Bogotá. */
export function diaBogota(ms: number): string {
  return new Date(ms - OFFSET).toISOString().slice(0, 10);
}
/** Instant (ms) a Bogotá calendar day starts. */
export function inicioDia(ymd: string): number {
  return Date.parse(`${ymd}T00:00:00Z`) + OFFSET;
}
/** Bogotá hour (0–23) of an instant. */
export function horaBogota(ms: number): number {
  return new Date(ms - OFFSET).getUTCHours();
}

export interface VentanaVentas {
  /** [desde, hasta) of the period, in ms. «Hoy» and «Esta semana» end now. */
  desde: number;
  hasta: number;
  /** The same span one week earlier — the comparison. */
  antes: { desde: number; hasta: number };
}

/** Monday-based week start (Bogotá) of a day. */
function lunes(ymd: string): string {
  const dow = new Date(`${ymd}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  const back = (dow + 6) % 7;
  return diaBogota(inicioDia(ymd) - back * DAY);
}

export function ventanaVentas(periodo: VentasPeriodo, now: number): VentanaVentas {
  const hoy = diaBogota(now);
  let desde: number;
  let hasta: number;
  if (periodo === "ayer") {
    hasta = inicioDia(hoy);
    desde = hasta - DAY;
  } else {
    desde = periodo === "semana" ? inicioDia(lunes(hoy)) : inicioDia(hoy);
    hasta = now;
  }
  const W = 7 * DAY;
  return { desde, hasta, antes: { desde: desde - W, hasta: hasta - W } };
}

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** «domingo» for an instant (Bogotá). */
export function diaSemanaDe(ms: number): string {
  return WEEKDAYS[new Date(ms - OFFSET).getUTCDay()];
}

/** «Domingo 1 de noviembre». */
export function fechaLarga(ms: number): string {
  const d = new Date(ms - OFFSET);
  const w = WEEKDAYS[d.getUTCDay()];
  return `${w[0].toUpperCase()}${w.slice(1)} ${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]}`;
}

/** How the comparison is worded under «Vendido». */
export function etiquetaComparacion(periodo: VentasPeriodo, now: number): string {
  if (periodo === "semana") return "la semana pasada a esta altura";
  if (periodo === "ayer") return `el ${diaSemanaDe(now - DAY)} anterior`;
  return `el ${diaSemanaDe(now)} pasado a esta hora`;
}

/** Paid amount of an order per method: its payment rows, or its own method and total. */
function pagosDe(o: VentaOrden): Array<{ method: VentaMetodo; amount: number }> {
  const norm = (m: string): VentaMetodo | null => (m === "tarjeta" ? "datafono" : (VENTA_METODOS as readonly string[]).includes(m) ? (m as VentaMetodo) : null);
  if (o.pagos.length) {
    return o.pagos.flatMap((p) => {
      const m = norm(p.method);
      return m && p.amount > 0 ? [{ method: m, amount: p.amount }] : [];
    });
  }
  const m = o.method ? norm(o.method) : null;
  return m ? [{ method: m, amount: o.total }] : [];
}

/** Hours the chart shows: 7–20 (the café's day), widened to any hour that sold. */
export const HORA_ABRE = 7;
export const HORA_CIERRA = 20;

export function resumirVentas(
  ordenes: readonly VentaOrden[],
  opts: { periodo: VentasPeriodo; now: number },
): ResumenVentas {
  const pagadas = ordenes.filter((o) => o.status === "pagada");
  const vendido = pagadas.reduce((n, o) => n + o.total, 0);
  const cancelados = ordenes.filter((o) => o.status === "cancelada" && !o.merged).length;
  const sinPagar = ordenes.filter((o) => o.status === "pendiente").length;
  const units = pagadas.reduce((n, o) => n + o.items.reduce((k, it) => k + it.qty, 0), 0);

  // ── by hour
  const byHour = new Map<number, VentaHora>();
  for (const o of pagadas) {
    const h = horaBogota(Date.parse(o.createdAt));
    const cur = byHour.get(h) ?? { hora: h, total: 0, pedidos: 0 };
    cur.total += o.total;
    cur.pedidos += 1;
    byHour.set(h, cur);
  }
  const horaActual = opts.periodo === "hoy" ? horaBogota(opts.now) : null;
  const seen = [...byHour.keys(), ...(horaActual !== null ? [horaActual] : [])];
  const from = Math.min(HORA_ABRE, ...seen);
  const to = Math.max(HORA_CIERRA, ...seen);
  const horas: VentaHora[] = [];
  for (let h = from; h <= to; h++) horas.push(byHour.get(h) ?? { hora: h, total: 0, pedidos: 0 });

  // ── by product (units)
  const byKey = new Map<string, VentaProducto>();
  for (const o of pagadas) {
    for (const it of o.items) {
      const cur = byKey.get(it.key) ?? { key: it.key, name: it.name, qty: 0 };
      cur.qty += it.qty;
      byKey.set(it.key, cur);
    }
  }
  const productos = [...byKey.values()].sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name, "es"));

  // ── by payment method
  const byMethod = new Map<VentaMetodo, VentaPago>(VENTA_METODOS.map((m) => [m, { method: m, count: 0, amount: 0 }]));
  for (const o of pagadas) {
    for (const p of pagosDe(o)) {
      const cur = byMethod.get(p.method)!;
      cur.count += 1;
      cur.amount += p.amount;
    }
  }

  // ── by person in session
  const byPerson = new Map<string, VentaPersona>();
  for (const o of [...pagadas].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const k = o.createdBy ?? "";
    const cur = byPerson.get(k) ?? { id: o.createdBy, pedidos: 0, total: 0, desde: o.createdAt };
    cur.pedidos += 1;
    cur.total += o.total;
    byPerson.set(k, cur);
  }
  const personas = [...byPerson.values()].sort((a, b) => b.total - a.total);

  return {
    periodo: opts.periodo,
    vendido,
    pedidos: pagadas.length + sinPagar,
    pagadas: pagadas.length,
    cancelados,
    sinPagar,
    ticket: pagadas.length ? Math.round(vendido / pagadas.length) : 0,
    itemsPorPedido: pagadas.length ? units / pagadas.length : 0,
    horas,
    horaActual,
    productos,
    pagos: VENTA_METODOS.map((m) => byMethod.get(m)!),
    personas,
  };
}

/** Change vs. the comparison, in whole percent; null when there is nothing to compare with. */
export function deltaPct(actual: number, antes: number): number | null {
  if (antes <= 0) return null;
  return Math.round(((actual - antes) / antes) * 100);
}

/** The goal for the period: the daily goal, × 7 for the week. */
export function metaDelPeriodo(metaDiaria: number | null, periodo: VentasPeriodo): number | null {
  if (!metaDiaria || metaDiaria <= 0) return null;
  return periodo === "semana" ? metaDiaria * 7 : metaDiaria;
}
