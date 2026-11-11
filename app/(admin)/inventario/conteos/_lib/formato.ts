import { cantidadLegible } from "@/lib/inventario/niveles";
import { MOTIVOS, type Motivo } from "@/lib/inventario/agente/planificador";
import type { ConteoPanel, LineaPanel } from "@/lib/inventario/agente/db";
import { fmtCOP } from "@/lib/utils";

/**
 * Formatting shared by the Conteos list and the count detail. Everything is
 * deterministic (fixed Spanish arrays, Bogotá = UTC−5, no DST) so the server
 * and the browser print the same text.
 */

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const local = (iso: string) => new Date(new Date(iso).getTime() - 5 * 3_600_000);

/** Local YYYY-MM-DD of an instant. */
export const diaDe = (iso: string) => local(iso).toISOString().slice(0, 10);

/** "8:16 a. m." */
export function horaDe(iso: string): string {
  const d = local(iso);
  const h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? "a. m." : "p. m."}`;
}

export function sumarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "mié 11 nov" */
export function diaCorto(dia: string): string {
  const d = new Date(`${dia}T12:00:00Z`);
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
}

/** "Hoy · mié 11 nov", "Ayer · mar 10 nov", "Lun 9 nov", "Mañana · jue 12 nov". */
export function etiquetaDia(dia: string, hoy: string): string {
  if (dia === hoy) return `Hoy · ${diaCorto(dia)}`;
  if (dia === sumarDias(hoy, -1)) return `Ayer · ${diaCorto(dia)}`;
  if (dia === sumarDias(hoy, 1)) return `Mañana · ${diaCorto(dia)}`;
  return cap(diaCorto(dia));
}

/** "Pipe Cipagauta" → "Pipe C." */
export function nombreCorto(full: string | null): string {
  if (!full) return "—";
  const [a, b] = full.trim().split(/\s+/);
  return b ? `${a} ${b.charAt(0).toUpperCase()}.` : a;
}

/** A quantity of a line, in pieces when the item is counted in pieces ("56 bolsas"). */
export function cantidad(n: number, l: Pick<LineaPanel, "unit" | "pieza" | "packLabel">): string {
  const sign = n < 0 ? "−" : "";
  const a = Math.abs(n);
  if (l.pieza && /^(g|gr|kg|ml|l|lt|cc|oz)$/i.test(l.unit.trim())) return sign + cantidadLegible(a, { unit: l.unit, pieza_qty: l.pieza, pack_qty: null, pack_label: l.packLabel });
  return `${sign}${fmtCOP(Math.round(a * 100) / 100)}${l.unit ? ` ${l.unit}` : ""}`;
}

export const diffDe = (l: Pick<LineaPanel, "counted" | "expected">) => Math.round((l.counted - l.expected) * 1000) / 1000;
export const valorDe = (l: Pick<LineaPanel, "counted" | "expected" | "unitCost">) => diffDe(l) * l.unitCost;

/** A line is in the stock: reviewed into it, or (old counts) part of an approved count. */
export const lineaAplicada = (l: LineaPanel, c: Pick<ConteoPanel, "status">) =>
  l.revision === "aplicado" || (l.revision === null && c.status === "aprobado");

/** Money missing in a count (negative diffs × cost), ignoring rejected lines. */
export function faltanteConteo(c: ConteoPanel): number {
  return c.lineas.reduce((s, l) => (l.revision === "rechazado" ? s : s + Math.min(0, valorDe(l))), 0);
}

export const porRevisar = (c: ConteoPanel) => c.status === "pendiente" || c.lineas.some((l) => l.revision === "revisar");

export type Tono = "late" | "ok" | "neutral" | "brand";
export const TONO: Record<Tono, { bg: string; fg: string }> = {
  late: { bg: "var(--late-soft)", fg: "var(--late)" },
  ok: { bg: "var(--ok-soft)", fg: "var(--ok)" },
  neutral: { bg: "var(--surface-2)", fg: "var(--muted)" },
  brand: { bg: "var(--brand-soft)", fg: "var(--text)" },
};

export function estadoConteo(c: ConteoPanel): { label: string; tono: Tono } {
  if (porRevisar(c)) return { label: "Por revisar", tono: "late" };
  if (c.status === "rechazado") return { label: "Rechazado", tono: "neutral" };
  return c.auto ? { label: "Se aplicó solo", tono: "ok" } : { label: "Aprobado", tono: "ok" };
}

/** The motivos behind a count's lines, most frequent first. */
export function motivosDe(c: ConteoPanel): Motivo[] {
  const n = new Map<Motivo, number>();
  for (const l of c.lineas) if (l.motivo) n.set(l.motivo, (n.get(l.motivo) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([m]) => m);
}

/** Reason pill of a count: the main motivo, or the old count kind. */
export function tipoConteo(c: ConteoPanel): { label: string; asistente: boolean } {
  if (c.kind === "diario") return { label: "Conteo de cierre", asistente: false };
  if (c.kind === "completo") return { label: "Conteo completo", asistente: false };
  const m = motivosDe(c)[0];
  return { label: m ? MOTIVOS[m].label : "Asistente", asistente: true };
}

export const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
