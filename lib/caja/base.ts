/**
 * Plan de base: given what was counted by denomination and the base to
 * leave for tomorrow, which bills and coins stay in the drawer. Pure — the
 * screen previews it live and the server recomputes it on submit.
 *
 * Rule: the base exists to give change, so it is made of the SMALLEST
 * pieces available. Formally: among the combinations of the counted pieces
 * that sum exactly to the target, the one with the most pieces (bounded
 * knapsack, in units of $50 — every COP denomination is a multiple). When
 * the exact target cannot be formed (e.g. only $50.000 bills), the plan is
 * the closest amount below it and `exacto` is false, so the team knows the
 * base is short and by how much. The complement (`resto`) is what leaves
 * the drawer as the entrega.
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
  // best[a] = max pieces summing to a·UNIT, -1 = unreachable. take[i][a] = pieces of denom i used at amount a.
  let best = new Int32Array(units + 1).fill(-1);
  best[0] = 0;
  const take: Int32Array[] = [];
  for (const d of piezas) {
    const w = d.valor / UNIT;
    const next = new Int32Array(units + 1).fill(-1);
    const used = new Int32Array(units + 1);
    for (let a = 0; a <= units; a++) {
      // k pieces of this denom on top of the previous denominations.
      const maxK = Math.min(d.cantidad, Math.floor(a / w));
      for (let k = 0; k <= maxK; k++) {
        const prev = best[a - k * w];
        if (prev < 0) continue;
        if (prev + k > next[a]) {
          next[a] = prev + k;
          used[a] = k;
        }
      }
    }
    best = next;
    take.push(used);
  }
  let amount = units;
  while (amount > 0 && best[amount] < 0) amount -= 1;
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

