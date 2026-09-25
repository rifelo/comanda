/**
 * Plan de base: given what was counted by denomination and the base to
 * leave for tomorrow, which bills and coins stay in the drawer. Pure — the
 * screen previews it live and the server recomputes it on submit.
 *
 * Goal: the base exists to give change, so it should be *sencillo* — a
 * balanced mix of coins and small bills, not the fewest pieces and not a
 * pile of one coin either. Each denomination has an ideal count for the
 * base (scaled from a $50.000 reference, `IDEAL_50K`) and a usefulness
 * weight; the k-th piece of a denomination is worth the weight while k is
 * within the ideal and loses half its worth for every piece beyond it.
 * Big bills (≥ $20.000) have an ideal of zero, so they only enter when the
 * small ones cannot reach the target. Among the combinations of the
 * counted pieces that sum EXACTLY to the target, the plan is the one with
 * the highest total usefulness (bounded knapsack in $50 units — every COP
 * denomination is a multiple). When the exact target cannot be formed, the
 * plan is the closest amount below it and `exacto` is false, so the team
 * knows the base is short and by how much. The complement (`resto`) is
 * what leaves the drawer as the entrega.
 */
import type { CajaCierre, CajaDenominacion } from "@/lib/types";

export interface PlanBase {
  objetivo: number;
  /** Pieces that stay in the drawer, largest first. */
  lineas: CajaDenominacion[];
  /** Sum of `lineas`. */
  total: number;
  /** total === objetivo. */
  exacto: boolean;
  /** objetivo − total when not exact (0 otherwise). */
  faltante: number;
  /** Pieces that leave the drawer (counted − lineas), largest first. */
  resto: CajaDenominacion[];
}

const UNIT = 50;
const MAX_UNITS = 400_000; // $20.000.000 — far above any drawer

/** Ideal pieces of each denomination in a $50.000 base (scaled to the target). */
const IDEAL_50K: Record<number, number> = { 50: 2, 100: 4, 200: 5, 500: 10, 1000: 10, 2000: 8, 5000: 3, 10000: 1, 20000: 0, 50000: 0, 100000: 0 };
/** How useful one piece is for giving change. */
const PESO: Record<number, number> = { 50: 0.2, 100: 0.6, 200: 0.8, 500: 1, 1000: 1, 2000: 1, 5000: 0.9, 10000: 0.7, 20000: 0.3, 50000: 0.05, 100000: 0.02 };

function idealPara(valor: number, objetivo: number): number {
  const base = IDEAL_50K[valor];
  if (base === undefined) return valor >= 20000 ? 0 : 4;
  return Math.max(0, Math.round((base * objetivo) / 50000));
}

/** Total usefulness of taking `k` pieces of `valor` for a base of `objetivo`. */
function utilidad(valor: number, k: number, objetivo: number): number {
  const ideal = idealPara(valor, objetivo);
  const peso = PESO[valor] ?? (valor >= 20000 ? 0.1 : 0.8);
  let u = 0;
  for (let i = 1; i <= k; i++) u += i <= ideal ? peso : peso * Math.pow(0.5, i - ideal);
  return u;
}

export function planBase(contado: ReadonlyArray<CajaDenominacion>, objetivo: number): PlanBase {
  const piezas = contado
    .filter((d) => d.cantidad > 0 && d.valor > 0 && d.valor % UNIT === 0)
    .map((d) => ({ valor: d.valor, cantidad: Math.floor(d.cantidad) }))
    .sort((a, b) => b.valor - a.valor);
  const disponible = piezas.reduce((s, d) => s + d.valor * d.cantidad, 0);
  const target = Math.max(0, Math.floor(objetivo));
  const empty = (): PlanBase => ({ objetivo: target, lineas: [], total: 0, exacto: target === 0, faltante: target, resto: piezas.map((d) => ({ ...d })) });
  if (target === 0 || piezas.length === 0) return empty();
  if (disponible <= target) {
    // Everything stays; short unless it happens to match.
    return { objetivo: target, lineas: piezas.map((d) => ({ ...d })), total: disponible, exacto: disponible === target, faltante: target - disponible, resto: [] };
  }

  const units = Math.min(Math.floor(target / UNIT), MAX_UNITS);
  // best[a] = max usefulness summing to a·UNIT, NaN = unreachable. take[i][a] = pieces of denom i used at amount a.
  let best = new Float64Array(units + 1).fill(Number.NaN);
  best[0] = 0;
  const take: Int32Array[] = [];
  for (const d of piezas) {
    const w = d.valor / UNIT;
    const next = new Float64Array(units + 1).fill(Number.NaN);
    const used = new Int32Array(units + 1);
    const util: number[] = [];
    for (let k = 0; k <= d.cantidad; k++) util.push(utilidad(d.valor, k, target));
    for (let a = 0; a <= units; a++) {
      const maxK = Math.min(d.cantidad, Math.floor(a / w));
      for (let k = 0; k <= maxK; k++) {
        const prev = best[a - k * w];
        if (Number.isNaN(prev)) continue;
        const cand = prev + util[k];
        if (Number.isNaN(next[a]) || cand > next[a] + 1e-9) {
          next[a] = cand;
          used[a] = k;
        }
      }
    }
    best = next;
    take.push(used);
  }
  let amount = units;
  while (amount > 0 && Number.isNaN(best[amount])) amount -= 1;
  const lineas: CajaDenominacion[] = [];
  let a = amount;
  for (let i = piezas.length - 1; i >= 0; i--) {
    const k = take[i][a];
    if (k > 0) lineas.push({ valor: piezas[i].valor, cantidad: k });
    a -= k * (piezas[i].valor / UNIT);
  }
  lineas.sort((x, y) => y.valor - x.valor);
  const total = amount * UNIT;
  const enBase = new Map(lineas.map((l) => [l.valor, l.cantidad]));
  const resto = piezas
    .map((d) => ({ valor: d.valor, cantidad: d.cantidad - (enBase.get(d.valor) ?? 0) }))
    .filter((d) => d.cantidad > 0);
  return { objetivo: target, lineas, total, exacto: total === target, faltante: target - total, resto };
}

export interface Sencillo {
  /** Coins (≤ $500). */
  monedas: number;
  /** $1.000 – $5.000. */
  pequenos: number;
  /** $10.000. */
  medianos: number;
  /** ≥ $20.000. */
  grandes: number;
  total: number;
  /** Share of the base in coins + small bills (0–1). */
  proporcion: number;
  /** true when there is no big bill and at least half the base is coins + small bills. */
  ok: boolean;
  /** Pieces the base is missing vs the ideal mix (e.g. "faltan billetes de $1.000"), for the hint. */
  escasea: number[];
}

/** How much change a base composition can give: split by tier plus a verdict. */
export function sencilloDe(lineas: ReadonlyArray<CajaDenominacion>, objetivo?: number): Sencillo {
  const r: Sencillo = { monedas: 0, pequenos: 0, medianos: 0, grandes: 0, total: 0, proporcion: 0, ok: false, escasea: [] };
  for (const l of lineas) {
    const v = l.valor * l.cantidad;
    r.total += v;
    if (l.valor <= 500) r.monedas += v;
    else if (l.valor <= 5000) r.pequenos += v;
    else if (l.valor <= 10000) r.medianos += v;
    else r.grandes += v;
  }
  r.proporcion = r.total > 0 ? (r.monedas + r.pequenos) / r.total : 0;
  r.ok = r.total > 0 && r.grandes === 0 && r.proporcion >= 0.5;
  const target = objetivo ?? r.total;
  const have = new Map(lineas.map((l) => [l.valor, l.cantidad]));
  for (const valor of [500, 1000, 2000, 5000]) {
    const ideal = idealPara(valor, target);
    if (ideal > 0 && (have.get(valor) ?? 0) < Math.ceil(ideal / 2)) r.escasea.push(valor);
  }
  return r;
}

/** "5 × $2.000 · 4 × $1.000" style summary; `fmt` formats a COP amount. */
export function describirLineas(lineas: ReadonlyArray<CajaDenominacion>, fmt: (n: number) => string): string {
  return lineas.map((l) => `${l.cantidad} × ${fmt(l.valor)}`).join(" · ");
}

/** True when two compositions hold the same pieces (order-insensitive). */
export function mismasLineas(a: ReadonlyArray<CajaDenominacion>, b: ReadonlyArray<CajaDenominacion>): boolean {
  const key = (xs: ReadonlyArray<CajaDenominacion>) =>
    xs.filter((x) => x.cantidad > 0).map((x) => `${x.valor}:${x.cantidad}`).sort().join("|");
  return key(a) === key(b);
}

/** Short status of a cierre's base: confirmed by who closed, validated by who opened. */
export function baseEstado(c: Pick<CajaCierre, "base_confirmada_at" | "base_validada_at" | "base_validada_ok" | "base_exacta">): { label: string; color: string } {
  if (c.base_validada_at) return c.base_validada_ok ? { label: "validada ✓", color: "var(--green)" } : { label: "no cuadró ✗", color: "var(--red)" };
  if (c.base_confirmada_at) return { label: "armada · por validar", color: "var(--amber)" };
  if (!c.base_exacta) return { label: "base corta", color: "var(--red)" };
  return { label: "sin confirmar", color: "var(--muted)" };
}

