/**
 * Pure helpers behind the owner's "Números del día" dashboard (no I/O;
 * unit-tested in dia.test.ts). Two views of the same day that must agree:
 *
 *   · ventas — orders CREATED that day and already paid (same rule as the
 *     reports), with their hours and products;
 *   · cobros — money that CAME IN that day, by method. Every payment row
 *     counts, plus the direct «Cobrar» sales, which write no orden_pagos row
 *     and only carry the method on the order.
 *
 * `cuadre` explains any gap between the two, so a leftover is a real
 * inconsistency and not a definition detail.
 */
import { localToUtc, type MetodoPago } from "@/lib/caja/arqueo";

export const METODOS: readonly MetodoPago[] = ["efectivo", "transferencia", "tarjeta"];
export const METODO_LABEL: Record<MetodoPago, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;
export function esFecha(v: string | undefined | null): v is string {
  if (!v || !YMD.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** YYYY-MM-DD shifted by `n` days. */
export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** The instants a wall-clock day starts and ends in `tz` (end exclusive). */
export function ventanaDia(ymd: string, tz: string): { desde: string; hasta: string } {
  return {
    desde: localToUtc(ymd, "00:00", tz).toISOString(),
    hasta: localToUtc(addDays(ymd, 1), "00:00", tz).toISOString(),
  };
}

/** Hour of the day (0–23) an instant falls on in `tz`. */
export function horaEnTz(iso: string, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  return Number(parts.find((p) => p.type === "hour")?.value ?? 0);
}

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
/** "jueves" for a YYYY-MM-DD. */
export function diaSemana(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

// ── inputs ──────────────────────────────────────────────────────

export interface OrdenItemDia {
  /** producto / combo id, or the name when the product is gone. */
  key: string;
  name: string;
  qty: number;
  unitPrice: number;
}

export interface OrdenPagoDia {
  method: string;
  amount: number;
  createdAt: string;
}

/** An order created inside the day. */
export interface OrdenDia {
  id: string;
  folio: string;
  status: "pagada" | "pendiente" | "cancelada";
  total: number;
  paymentMethod: string | null;
  createdAt: string;
  paidAt: string | null;
  /** Cancelled because it was combined into another order: not a real cancel. */
  merged: boolean;
  customer: string | null;
  notes: string | null;
  items: OrdenItemDia[];
  pagos: OrdenPagoDia[];
}

/** A payment row received inside the day (its order may be from another day). */
export interface PagoDia {
  method: string;
  amount: number;
  createdAt: string;
  ordenStatus: string;
  ordenCreatedAt: string;
}

/** A paid order of the day the numbers are compared with. */
export interface OrdenPrevia {
  total: number;
  createdAt: string;
}

export interface ResumenDiaInput {
  desde: string;
  hasta: string;
  tz: string;
  ordenes: OrdenDia[];
  pagos: PagoDia[];
  /** Paid orders of the comparison day (same weekday, a week before). */
  previas: OrdenPrevia[];
  /** Only count `previas` created before this instant ("a esta hora"). */
  previasHasta?: string | null;
}

// ── outputs ─────────────────────────────────────────────────────

export interface CobroMetodo {
  monto: number;
  pagos: number;
}

export interface HoraDia {
  hora: number;
  total: number;
  pedidos: number;
  /** Same hour on the comparison day (whole hour, no cutoff). */
  previo: number;
}

export interface ProductoDia {
  key: string;
  name: string;
  unidades: number;
  ingreso: number;
}

export interface AjusteCuadre {
  label: string;
  monto: number;
}

export interface CanceladoDia {
  id: string;
  folio: string;
  createdAt: string;
  total: number;
  customer: string | null;
  notes: string | null;
}

export interface ResumenDia {
  ventas: { total: number; pedidos: number; ticket: number };
  /** Comparison day up to the same time; `pct` is null when there is nothing to compare with. */
  comparacion: { total: number; pedidos: number; pct: number | null };
  cobros: Record<MetodoPago, CobroMetodo> & { total: number; pagos: number };
  /** cobrado − vendido, with the legitimate reasons; `sinExplicar` should be 0. */
  cuadre: { diferencia: number; ajustes: AjusteCuadre[]; sinExplicar: number };
  horas: HoraDia[];
  productos: ProductoDia[];
  cancelados: { n: number; total: number; lista: CanceladoDia[] };
  combinados: number;
  /** Cash that came in, oldest first: the arqueo is compared against these. */
  efectivo: Array<{ at: string; amount: number }>;
}

function esMetodo(m: string | null): m is MetodoPago {
  return m === "efectivo" || m === "transferencia" || m === "tarjeta";
}

export function resumenDia(input: ResumenDiaInput): ResumenDia {
  const { desde, hasta, tz } = input;
  // ISO strings from the DB can carry another offset/precision: compare instants.
  const t = (iso: string) => new Date(iso).getTime();
  const tDesde = t(desde);
  const tHasta = t(hasta);
  const enDia = (iso: string) => {
    const x = t(iso);
    return x >= tDesde && x < tHasta;
  };

  const pagadas = input.ordenes.filter((o) => o.status === "pagada");

  // ── ventas ──
  const total = pagadas.reduce((s, o) => s + o.total, 0);
  const ventas = { total, pedidos: pagadas.length, ticket: pagadas.length ? Math.round(total / pagadas.length) : 0 };

  // ── comparación ──
  const corte = input.previasHasta ? t(input.previasHasta) : null;
  const previasCorte = input.previas.filter((o) => corte == null || t(o.createdAt) < corte);
  const prevTotal = previasCorte.reduce((s, o) => s + o.total, 0);
  const comparacion = {
    total: prevTotal,
    pedidos: previasCorte.length,
    pct: prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null,
  };

  // ── cobros ──
  const cobros = {
    efectivo: { monto: 0, pagos: 0 },
    transferencia: { monto: 0, pagos: 0 },
    tarjeta: { monto: 0, pagos: 0 },
    total: 0,
    pagos: 0,
  };
  const efectivo: Array<{ at: string; amount: number }> = [];
  const cobrar = (method: string | null, amount: number, at: string) => {
    if (!esMetodo(method) || amount <= 0) return;
    cobros[method].monto += amount;
    cobros[method].pagos += 1;
    cobros.total += amount;
    cobros.pagos += 1;
    if (method === "efectivo") efectivo.push({ at, amount });
  };
  for (const p of input.pagos) {
    if (p.ordenStatus === "cancelada" || !enDia(p.createdAt)) continue;
    cobrar(p.method, p.amount, p.createdAt);
  }
  // Direct «Cobrar»: paid in the same instant it was created, no payment row.
  for (const o of pagadas) {
    if (o.pagos.length > 0) continue;
    cobrar(o.paymentMethod, o.total, o.paidAt ?? o.createdAt);
  }
  efectivo.sort((a, b) => t(a.at) - t(b.at));

  // ── cuadre cobrado vs vendido ──
  let abonos = 0;
  let otrosDias = 0;
  for (const p of input.pagos) {
    if (p.ordenStatus === "cancelada" || !enDia(p.createdAt)) continue;
    if (p.ordenStatus === "pendiente") abonos += p.amount;
    else if (!enDia(p.ordenCreatedAt)) otrosDias += p.amount;
  }
  let cobradasOtroDia = 0;
  for (const o of pagadas) {
    for (const p of o.pagos) if (!enDia(p.createdAt)) cobradasOtroDia += p.amount;
  }
  const ajustes: AjusteCuadre[] = [];
  if (abonos) ajustes.push({ label: "abonos a pedidos que siguen abiertos", monto: abonos });
  if (otrosDias) ajustes.push({ label: "cobros de pedidos de otros días", monto: otrosDias });
  if (cobradasOtroDia) ajustes.push({ label: "ventas de este día cobradas otro día", monto: -cobradasOtroDia });
  const diferencia = cobros.total - ventas.total;
  const cuadre = { diferencia, ajustes, sinExplicar: diferencia - ajustes.reduce((s, a) => s + a.monto, 0) };

  // ── horas ──
  const porHora = new Map<number, HoraDia>();
  const slot = (h: number) => {
    let s = porHora.get(h);
    if (!s) porHora.set(h, (s = { hora: h, total: 0, pedidos: 0, previo: 0 }));
    return s;
  };
  for (const o of pagadas) {
    const s = slot(horaEnTz(o.createdAt, tz));
    s.total += o.total;
    s.pedidos += 1;
  }
  for (const o of input.previas) slot(horaEnTz(o.createdAt, tz)).previo += o.total;
  const usadas = [...porHora.keys()];
  const horas: HoraDia[] = [];
  if (usadas.length) {
    for (let h = Math.min(...usadas); h <= Math.max(...usadas); h++) horas.push(slot(h));
  }

  // ── productos ──
  const porProducto = new Map<string, ProductoDia>();
  for (const o of pagadas) {
    for (const it of o.items) {
      let p = porProducto.get(it.key);
      if (!p) porProducto.set(it.key, (p = { key: it.key, name: it.name, unidades: 0, ingreso: 0 }));
      p.unidades += it.qty;
      p.ingreso += it.qty * it.unitPrice;
    }
  }
  const productos = [...porProducto.values()].sort(
    (a, b) => b.unidades - a.unidades || b.ingreso - a.ingreso || a.name.localeCompare(b.name),
  );

  // ── cancelados ──
  const canceladas = input.ordenes.filter((o) => o.status === "cancelada");
  const reales = canceladas.filter((o) => !o.merged);
  const cancelados = {
    n: reales.length,
    total: reales.reduce((s, o) => s + o.total, 0),
    lista: reales.map((o) => ({ id: o.id, folio: o.folio, createdAt: o.createdAt, total: o.total, customer: o.customer, notes: o.notes })),
  };

  return { ventas, comparacion, cobros, cuadre, horas, productos, cancelados, combinados: canceladas.length - reales.length, efectivo };
}

// ── caja ────────────────────────────────────────────────────────

/** A live (not rejected) cash count of the day. */
export interface ArqueoDia {
  id: string;
  turno: string | null;
  at: string;
  contadoPor: string | null;
  status: "pendiente" | "aprobado";
  baseInicial: number;
  contado: number;
  baseDejada: number;
}

export interface CuadreCaja {
  /** Float the day opened with: the first count's base, else what the last close left. */
  base: number;
  baseOrigen: "arqueo" | "cierre-anterior" | "sin-dato";
  /** Cash the system saw come in during the whole day. */
  efectivo: number;
  arqueos: Array<ArqueoDia & { entro: number; entrega: number }>;
  /** Cash the system saw up to the last count, and after it. */
  efectivoHastaArqueo: number;
  efectivoDespues: number;
  /** What the drawer gained according to the counts: Σ (contado − base inicial). */
  entro: number;
  /** entro − efectivoHastaArqueo; negative = money missing. Null without counts. */
  diferencia: number | null;
  /** What should be in the drawer right now. */
  enCaja: number;
}

/**
 * The day's cash against the team's counts. Each count says how much the
 * drawer gained since its own base (contado − base inicial), so the sum over
 * the day is comparable with ALL the cash the system saw up to the last
 * count, no matter how the turnos' windows were cut.
 */
export function cuadreCaja(input: {
  arqueos: ArqueoDia[];
  /** base_dejada of the last live close before this day, when known. */
  baseAnterior: number | null;
  efectivo: ReadonlyArray<{ at: string; amount: number }>;
}): CuadreCaja {
  const t = (iso: string) => new Date(iso).getTime();
  const arqueos = [...input.arqueos]
    .sort((a, b) => t(a.at) - t(b.at))
    .map((a) => ({ ...a, entro: a.contado - a.baseInicial, entrega: a.contado - a.baseDejada }));
  const efectivo = input.efectivo.reduce((s, e) => s + e.amount, 0);
  const first = arqueos[0];
  const last = arqueos[arqueos.length - 1];
  const base = first ? first.baseInicial : (input.baseAnterior ?? 0);
  const baseOrigen = first ? "arqueo" : input.baseAnterior != null ? "cierre-anterior" : "sin-dato";

  if (!last) {
    return { base, baseOrigen, efectivo, arqueos, efectivoHastaArqueo: 0, efectivoDespues: efectivo, entro: 0, diferencia: null, enCaja: base + efectivo };
  }
  const corte = t(last.at);
  const hasta = input.efectivo.reduce((s, e) => s + (t(e.at) <= corte ? e.amount : 0), 0);
  const entro = arqueos.reduce((s, a) => s + a.entro, 0);
  return {
    base,
    baseOrigen,
    efectivo,
    arqueos,
    efectivoHastaArqueo: hasta,
    efectivoDespues: efectivo - hasta,
    entro,
    diferencia: entro - hasta,
    enCaja: last.baseDejada + (efectivo - hasta),
  };
}
