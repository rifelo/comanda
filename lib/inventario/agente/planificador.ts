/**
 * Inventory assistant — which items to verify, pure (no I/O; tested in
 * planificador.test.ts). Numbers come from here, never from a language model.
 *
 * The team counts only what the assistant asks for, so every count has a
 * reason (`Motivo`):
 *   aviso        someone marked the item «poco» / «se acabó» on the tablet
 *   antes_pedir  it is at or under its reorder point: confirm before buying
 *   vendido_ayer it was sold the day before: every day for high-rotation items,
 *                at most once a week for low-rotation ones (see `rotacionDe`)
 *   sin_contar   nobody has counted it in `diasSinContar` days
 * The owner turns each reason on or off. There is no fixed budget: every
 * item that needs a check gets one (the owner may still set a cap, `max`).
 * Two reasons are bounded by what "needed" means: «más vendido» takes the
 * items that make up most (80 %) of the day's consumed value, and «sin
 * contar» walks one zone per day so a never-counted shelf doesn't flood the
 * list. Open tasks from earlier days come back too.
 */

import { MASIVO_CONTEO_DIAS } from "./par";

export type Motivo = "pendiente" | "vendido_ayer" | "mas_vendido" | "aviso" | "antes_pedir" | "sin_contar" | "manual" | "segunda";

export const MOTIVOS: Record<Motivo, { label: string; desc: string }> = {
  pendiente: { label: "Pendiente de días anteriores", desc: "Se pidió contar, nadie alcanzó y se venció" },
  vendido_ayer: { label: "Vendido ayer", desc: "Lo que se vendió el día anterior (baja rotación: máximo una vez por semana)" },
  // tasks planned before 2026-11-11 (best sellers); kept so history still reads
  mas_vendido: { label: "Más vendido", desc: "Lo que más costo salió ayer" },
  aviso: { label: "Aviso del equipo", desc: "Alguien marcó «poco» o «se acabó»" },
  antes_pedir: { label: "Antes de pedir", desc: "Confirma antes de proponer una compra" },
  sin_contar: { label: "Sin contar hace días", desc: "Lo que lleva días sin contarse" },
  manual: { label: "Pedido por el dueño", desc: "El dueño pidió contarlo" },
  segunda: { label: "Segunda verificación", desc: "El conteo anterior no cuadró" },
};

/** Reasons the owner can switch off (manual and segunda always run). */
export const REGLAS = ["vendido_ayer", "aviso", "antes_pedir", "sin_contar"] as const;
export type Regla = (typeof REGLAS)[number];

export interface AgenteConfig {
  reglas: Record<Regla, boolean>;
  /** Optional cap on items per day (open tasks included); null = every item that needs it. */
  max: number | null;
  diasSinContar: number;
}

export const CONFIG_DEFAULT: AgenteConfig = {
  reglas: { vendido_ayer: true, aviso: true, antes_pedir: true, sin_contar: true },
  max: null,
  diasSinContar: 14,
};

export interface Candidato {
  ingredienteId: string;
  name: string;
  ubicacion: string | null;
  stock: number;
  stockMin: number;
  costo: number;
  /** Consumed by sales on the day looked at, in stock units (positive). */
  vendido: number;
  /** Orders that consumed it that day. */
  pedidos: number;
  /** Days since it was last counted; null = never. */
  diasSinContar: number | null;
  /** Open «poco» / «se acabó» mark, with who reported it and how many days ago. */
  aviso: { estado: "bajo" | "agotado"; por: string | null; dias: number } | null;
  /** Effective rotation: pinned by the owner, else computed from sales. */
  rotacion: Rotacion;
  /** Bulk, low-frequency buy (see par.ts): counted weekly by closed boxes, not daily. */
  masivo: boolean;
  /** Reorder point (PAR) computed by the assistant; null = not enough data. */
  puntoPedido: number | null;
  /** Has a supplier (only then «antes de pedir» makes sense). */
  conProveedor: boolean;
  /** Already has an open task. */
  abierta: boolean;
  /** A verification that expired without a count since: when it was first asked and how many times it expired. */
  vencida?: { desde: string; veces: number } | null;
}

export interface TareaPlan {
  ingredienteId: string;
  motivo: Motivo;
  detalle: string;
  prioridad: number;
}

export type Rotacion = "alta" | "baja";

/** Days of sales looked at to decide rotation. */
export const ROTACION_VENTANA = 14;
/** High rotation: sold on at least this share of the days the café sold anything. */
export const ROTACION_UMBRAL = 0.5;
/** A low-rotation item sold yesterday is verified again only after this many days. */
export const BAJA_ROTACION_DIAS = 7;

/**
 * Rotation of an item from how many of the café's selling days (in the last
 * `ROTACION_VENTANA`) it was sold on. With fewer than 3 selling days there is
 * not enough to tell: low.
 */
export function rotacionDe(diasVendido: number, diasAbiertos: number): Rotacion {
  if (diasAbiertos < 3) return "baja";
  return diasVendido / diasAbiertos >= ROTACION_UMBRAL ? "alta" : "baja";
}
/** A «poco» / «se acabó» mark older than this no longer asks for a count. */
export const AVISO_DIAS = 3;

const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString("es-CO", { maximumFractionDigits: 1 });

/**
 * How much the stock number can be trusted, as a multiplier ≥ 1 on the value
 * of checking it: a negative stock or a long time without a count makes the
 * check worth more.
 */
export function desconfianza(c: Pick<Candidato, "stock" | "diasSinContar">): number {
  let f = 1;
  if (c.stock < 0) f += 1;
  if (c.diasSinContar === null) f += 1;
  else f += Math.min(c.diasSinContar, 28) / 14;
  return f;
}

/**
 * The tasks for one day: every item that needs a check, ordered by priority,
 * never two for the same item. `abiertas` is how many open tasks already
 * exist; they only matter when the owner set a cap (`config.max`).
 */
export function planificar(candidatos: ReadonlyArray<Candidato>, config: AgenteConfig, abiertas: number, opts: { cantidad?: (c: Candidato, qty: number) => string } = {}): TareaPlan[] {
  const cupo = config.max == null ? Infinity : Math.max(0, config.max - abiertas);
  if (cupo === 0) return [];
  const q = opts.cantidad ?? ((_c: Candidato, n: number) => fmt(n));
  const elegidos = new Map<string, TareaPlan>();
  const add = (t: TareaPlan) => {
    const prev = elegidos.get(t.ingredienteId);
    if (!prev || prev.prioridad < t.prioridad) elegidos.set(t.ingredienteId, t);
  };
  const libres = candidatos.filter((c) => !c.abierta);

  // 0. What expired without being counted comes back first, always (no switch):
  //    the system still doesn't know how much there is.
  for (const c of libres) {
    if (!c.vencida) continue;
    const [, m, d] = c.vencida.desde.split("-");
    const veces = c.vencida.veces > 1 ? ` · se venció ${c.vencida.veces} veces` : "";
    add({ ingredienteId: c.ingredienteId, motivo: "pendiente", detalle: `Venció sin contarse · se pidió el ${d}/${m}${veces}`, prioridad: 500 + Math.min(c.vencida.veces, 10) });
  }

  // 1. What the team flagged while the system still thinks there is enough:
  //    one of the two is wrong. A recent mark only (a mark stays open until
  //    the item is restocked).
  if (config.reglas.aviso) {
    const avisos = libres.filter((c) => {
      if (!c.aviso || c.aviso.dias > AVISO_DIAS) return false;
      return c.aviso.estado === "agotado" ? c.stock > 0 : c.stock > c.stockMin;
    });
    for (const c of avisos) {
      if (!c.aviso) continue;
      const que = c.aviso.estado === "agotado" ? "«se acabó»" : "«poco»";
      add({ ingredienteId: c.ingredienteId, motivo: "aviso", detalle: `${c.aviso.por ?? "El equipo"} marcó ${que}`, prioridad: 400 + (c.aviso.estado === "agotado" ? 50 : 0) });
    }
  }
  // 2. About to be ordered: a wrong number here is a wrong purchase.
  //    The threshold is the reorder point (PAR) when the assistant has one,
  //    else the owner's minimum.
  if (config.reglas.antes_pedir) {
    const umbral = (c: Candidato) => (c.puntoPedido != null && c.puntoPedido > 0 ? c.puntoPedido : c.stockMin > 0 ? c.stockMin : null);
    const porPedir = libres
      .filter((c) => {
        const u = umbral(c);
        return c.conProveedor && u != null && c.stock <= u;
      })
      .sort((a, b) => b.costo * (umbral(b) ?? 0) - a.costo * (umbral(a) ?? 0));
    for (const c of porPedir) {
      const u = umbral(c)!;
      const que = c.puntoPedido ? "punto de reorden" : "mínimo";
      add({ ingredienteId: c.ingredienteId, motivo: "antes_pedir", detalle: c.stock < 0 ? `Para pedir y el sistema marca negativo` : `Para pedir: quedan ${q(c, c.stock)} (${que} ${q(c, u)})`, prioridad: 300 });
    }
  }
  // 3. Everything sold yesterday. High rotation: every time. Low rotation:
  //    only if it hasn't been counted in the last BAJA_ROTACION_DIAS days.
  //    Ordered by sold value × how little we trust its number.
  if (config.reglas.vendido_ayer) {
    const vendidos = libres
      .filter((c) => c.vendido > 0 && !c.masivo)
      .filter((c) => c.rotacion === "alta" || c.diasSinContar === null || c.diasSinContar >= BAJA_ROTACION_DIAS)
      .map((c) => ({ c, score: c.vendido * Math.max(c.costo, 0) * desconfianza(c) }))
      .sort((a, b) => b.score - a.score);
    const top = vendidos[0]?.score || 1;
    for (const { c, score } of vendidos) {
      const neg = c.stock < 0 ? " · el sistema marca negativo" : "";
      const rot = c.rotacion === "alta" ? "alta rotación" : "baja rotación";
      add({ ingredienteId: c.ingredienteId, motivo: "vendido_ayer", detalle: `${q(c, c.vendido)} ayer · ${c.pedidos} ${c.pedidos === 1 ? "pedido" : "pedidos"} · ${rot}${neg}`, prioridad: 100 + Math.round((score / top) * 100) });
    }
  }
  // 4. What nobody has looked at in a long time, one zone per day (the zone
  //    with the most overdue items), so the walk stays one trip.
  if (config.reglas.sin_contar) {
    // Bulk buys: a weekly count by closed boxes, whatever the zone.
    for (const c of libres.filter((c) => c.masivo && (c.diasSinContar === null || c.diasSinContar >= MASIVO_CONTEO_DIAS))) {
      add({ ingredienteId: c.ingredienteId, motivo: "sin_contar", detalle: "Compra masiva: conteo semanal por cajas cerradas", prioridad: 60 });
    }
    const vencido = (c: Candidato) => c.diasSinContar === null || c.diasSinContar >= config.diasSinContar;
    const porZona = new Map<string, Candidato[]>();
    for (const c of libres.filter((c) => !c.masivo && vencido(c) && !elegidos.has(c.ingredienteId))) {
      const z = (c.ubicacion ?? "").trim().toLowerCase() || "—";
      porZona.set(z, [...(porZona.get(z) ?? []), c]);
    }
    const zona = [...porZona.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))[0]?.[1] ?? [];
    for (const c of zona) {
      const d = c.diasSinContar;
      add({ ingredienteId: c.ingredienteId, motivo: "sin_contar", detalle: d === null ? "Nunca se ha contado" : `${d} días sin contarse`, prioridad: 10 + Math.min(d ?? 60, 60) });
    }
  }
  const zona = (id: string) => (candidatos.find((c) => c.ingredienteId === id)?.ubicacion ?? "").toLowerCase();
  return [...elegidos.values()]
    .sort((a, b) => b.prioridad - a.prioridad || zona(a.ingredienteId).localeCompare(zona(b.ingredienteId)))
    .slice(0, cupo);
}

/** Share of the expected stock a verified line may differ by and still apply by itself. */
export const TOLERANCIA_LINEA = 0.25;

/**
 * Whether one verified line can correct the stock by itself. When the system
 * was at zero or below, its number was already wrong: what the barista sees is
 * the truth. Otherwise a difference within one piece (or one unit) or 25 % of
 * what was expected is a counting slip; anything bigger needs a second look.
 */
export function lineaAplicaSola(l: { expected: number; counted: number; pieza: number | null }): boolean {
  if (l.expected <= 0) return true;
  const diff = Math.abs(l.counted - l.expected);
  const margen = Math.max(l.pieza && l.pieza > 0 ? l.pieza : 1, l.expected * TOLERANCIA_LINEA);
  return diff <= margen + 1e-9;
}

/** Days between two ISO dates (YYYY-MM-DD), b − a. */
export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
