/**
 * Pure helpers for the owner's Hoy (docs/redesign/PLAN.md §2.3): the date
 * label, each turno's state and late tasks, and the «Por atender» list.
 * No I/O — tested in hoy.test.ts; the data comes from hoy-db.ts.
 */

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"] as const;

/** "viernes 31 de octubre" — deterministic (no locale APIs), SSR-safe. */
export function fechaLarga(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DIAS[dow]} ${d} de ${MESES[m - 1]}`;
}

/** "Viernes 31 oct" — title for a past day. */
export function fechaTitulo(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const dia = DIAS[dow];
  return `${dia[0].toUpperCase()}${dia.slice(1)} ${d} ${MESES[m - 1].slice(0, 3)}`;
}

// ── turnos ─────────────────────────────────────────────────────────

export type EstadoTurno = "por_abrir" | "en_curso" | "por_revisar" | "revisado";

export const ESTADO_TURNO: Record<EstadoTurno, { label: string; tone: "neutral" | "ok" | "late" | "brand" }> = {
  por_abrir: { label: "Por abrir", tone: "neutral" },
  en_curso: { label: "En curso", tone: "ok" },
  por_revisar: { label: "Por revisar", tone: "brand" },
  revisado: { label: "Revisado", tone: "ok" },
};

/** The state of one turno on the day (no instance yet = por abrir). */
export function estadoTurno(i: { status: "open" | "closed" | null; reviewedAt: string | null }): EstadoTurno {
  if (i.status === "open") return "en_curso";
  if (i.status === "closed") return i.reviewedAt ? "revisado" : "por_revisar";
  return "por_abrir";
}

/** "HH:MM[:SS]" → minutes since midnight. */
function minutos(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Tasks of an open turno whose time already passed and are not done.
 * `now` is the sede's wall clock "HH:MM"; tasks without a time never count.
 */
export function atrasadas(
  tasks: ReadonlyArray<{ id: string; due_time: string | null }>,
  done: ReadonlySet<string>,
  now: string,
): number {
  const t = minutos(now);
  return tasks.filter((k) => k.due_time && !done.has(k.id) && minutos(k.due_time) < t).length;
}

// ── por atender ────────────────────────────────────────────────────

export interface PorAtenderInput {
  date: string;
  turnosPorRevisar: number;
  arqueosPorAprobar: number;
  /** Latest cash close: did the next turno find the base it left? */
  base: { estado: "ok" | "por_validar" | "no_cuadro" | null; turno: string | null };
  agotado: number;
  bajo: number;
  conteosPorAprobar: number;
  costosPorRevisar: number;
  sugerencias: number;
  pedidosAbiertos: number;
  pedidosViejos: number;
  porCobrar: number;
}

export interface PorAtenderItem {
  id: string;
  title: string;
  sub: string;
  href: string;
  tone: "late" | "neutral";
}

const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;

/**
 * What the owner should look at, most urgent first (red before neutral).
 * Only items with something pending are returned; empty = «todo al día».
 */
export function porAtender(c: PorAtenderInput, fmt: (cop: number) => string): PorAtenderItem[] {
  const late: PorAtenderItem[] = [];
  const rest: PorAtenderItem[] = [];
  if (c.base.estado === "no_cuadro") {
    late.push({ id: "base", title: "La base no cuadró", sub: `${c.base.turno ? `Base de ${c.base.turno}` : "Último cierre"}: revisa la caja`, href: "/caja", tone: "late" });
  }
  if (c.agotado > 0) {
    late.push({
      id: "agotado",
      title: `${n(c.agotado, "cosa se acabó", "cosas se acabaron")}`,
      sub: c.bajo > 0 ? `y ${n(c.bajo, "queda poco de otra", "quedan pocas de otras")}` : "Reportado por el equipo",
      href: "/inventario?vista=acabando",
      tone: "late",
    });
  } else if (c.bajo > 0) {
    rest.push({ id: "agotado", title: `${n(c.bajo, "se está acabando", "se están acabando")}`, sub: "Reportado por el equipo", href: "/inventario?vista=acabando", tone: "neutral" });
  }
  if (c.pedidosViejos > 0) {
    late.push({ id: "pedidos-viejos", title: n(c.pedidosViejos, "pedido de otro día sin cobrar", "pedidos de otros días sin cobrar"), sub: "Cóbralos o cancélalos en el POS", href: "/pos", tone: "late" });
  }
  if (c.turnosPorRevisar > 0) {
    rest.push({ id: "turnos", title: n(c.turnosPorRevisar, "turno por revisar", "turnos por revisar"), sub: "Tareas, fotos y novedades del cierre", href: `/hoy/${c.date}/turnos`, tone: "neutral" });
  }
  if (c.arqueosPorAprobar > 0) {
    rest.push({ id: "arqueos", title: n(c.arqueosPorAprobar, "arqueo por aprobar", "arqueos por aprobar"), sub: "Lo que contó el equipo al cerrar", href: "/caja", tone: "neutral" });
  }
  if (c.base.estado === "por_validar") {
    rest.push({ id: "base", title: "Base por validar", sub: `${c.base.turno ? `La dejó ${c.base.turno}` : "La dejó el último cierre"}; la valida quien abre`, href: "/caja", tone: "neutral" });
  }
  if (c.conteosPorAprobar > 0) {
    rest.push({ id: "conteos", title: n(c.conteosPorAprobar, "conteo por aprobar", "conteos por aprobar"), sub: "Conteo de inventario del equipo", href: "/inventario/conteos", tone: "neutral" });
  }
  if (c.costosPorRevisar > 0) {
    rest.push({ id: "costos", title: n(c.costosPorRevisar, "costo por revisar", "costos por revisar"), sub: "Insumos sin costo, precios en 0 o margen bajo", href: "/productos?vista=revisar", tone: "neutral" });
  }
  if (c.sugerencias > 0) {
    rest.push({ id: "sugerencias", title: n(c.sugerencias, "sugerencia del equipo", "sugerencias del equipo"), sub: "Ítems que faltan o van en otra zona", href: "/inventario/sugerencias", tone: "neutral" });
  }
  if (c.pedidosAbiertos > c.pedidosViejos) {
    const hoy = c.pedidosAbiertos - c.pedidosViejos;
    rest.push({ id: "pedidos", title: n(hoy, "pedido abierto", "pedidos abiertos"), sub: `${fmt(c.porCobrar)} por cobrar`, href: "/pos", tone: "neutral" });
  }
  return [...late, ...rest];
}

/** Base state of the latest cash close, for «Por atender». */
export function estadoBase(c: { base_validada_at: string | null; base_validada_ok: boolean | null } | null): PorAtenderInput["base"]["estado"] {
  if (!c) return null;
  if (c.base_validada_at) return c.base_validada_ok === false ? "no_cuadro" : "ok";
  return "por_validar";
}
