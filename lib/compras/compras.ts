/**
 * Purchasing, pure (no I/O; tested in compras.test.ts): what there is to
 * order and from whom, when each supplier's order day falls, and the message
 * that goes out by WhatsApp.
 *
 * The list has three sources, merged per item: its level (at or under the
 * reorder point), what the team flagged by eye (faltantes) and what they
 * asked for from the tablet (solicitudes). What is already on its way in an
 * open order is left out unless someone asked for it again.
 * Quantities are in the item's stock unit, rounded up to whole purchase lots.
 */
import { cantidadLegible, nivelDe, sugerido, type Nivel, type NivelItem } from "@/lib/inventario/niveles";

export const DIAS_CORTOS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"] as const;

export interface PedirItem extends NivelItem {
  id: string;
  name: string;
  stock: number;
  proveedor_id: string | null;
}

export interface SolicitudAbierta {
  id: string;
  ingrediente_id: string | null;
  nombre: string | null;
  qty: number | null;
  note: string | null;
  requested_by_name: string | null;
  requested_at: string;
}

export type Motivo = "nivel" | "faltante" | "solicitud";

export interface LineaPedir {
  /** Stable key: the item id, or the request id for a free-text line. */
  key: string;
  ingredienteId: string | null;
  nombre: string;
  proveedorId: string | null;
  nivel: Nivel | null;
  stock: number | null;
  /** Suggested quantity, stock units. */
  qty: number;
  /** The same quantity the way it is said ("2 bolsas"); free-text lines have none. */
  legible: string | null;
  motivos: Motivo[];
  solicitudIds: string[];
  faltanteIds: string[];
  notas: string[];
}

/** One lot of an item: what "pide uno" means when nothing says how much. */
function unLote(it: NivelItem): number {
  const pack = Number(it.pack_qty ?? 0);
  if (pack > 0) return pack;
  const pieza = Number(it.pieza_qty ?? 0);
  return pieza > 0 ? pieza : 1;
}
/** `qty` rounded up to whole purchase lots. */
function aLotes(qty: number, it: NivelItem): number {
  const pack = Number(it.pack_qty ?? 0);
  return pack > 1 ? Math.ceil(qty / pack - 1e-9) * pack : Math.ceil(qty - 1e-9);
}

export function porPedir(input: {
  items: ReadonlyArray<PedirItem>;
  faltantes: ReadonlyArray<{ id: string; ingrediente_id: string; estado: "bajo" | "agotado" | "ok"; note: string | null }>;
  solicitudes: ReadonlyArray<SolicitudAbierta>;
  /** Stock units already on their way per item (open orders). */
  enCamino: Readonly<Record<string, number>>;
}): LineaPedir[] {
  const lineas: LineaPedir[] = [];
  for (const it of input.items) {
    const fal = input.faltantes.filter((f) => f.ingrediente_id === it.id && f.estado !== "ok");
    const sol = input.solicitudes.filter((s) => s.ingrediente_id === it.id);
    const nivel = nivelDe(it.stock, it.stock_critico, it.stock_min);
    const porNivel = sugerido(it.stock, it).qty;
    const motivos: Motivo[] = [];
    if (porNivel > 0) motivos.push("nivel");
    if (fal.length) motivos.push("faltante");
    if (sol.length) motivos.push("solicitud");
    if (!motivos.length) continue;
    if ((input.enCamino[it.id] ?? 0) > 0 && !sol.length) continue;
    const pedido = sol.reduce((n, s) => n + (s.qty ?? 0), 0);
    const qty = Math.max(porNivel, pedido > 0 ? aLotes(pedido, it) : 0) || unLote(it);
    lineas.push({
      key: it.id,
      ingredienteId: it.id,
      nombre: it.name,
      proveedorId: it.proveedor_id,
      nivel,
      stock: it.stock,
      qty,
      legible: cantidadLegible(qty, it),
      motivos,
      solicitudIds: sol.map((s) => s.id),
      faltanteIds: fal.map((f) => f.id),
      notas: [...fal.map((f) => f.note), ...sol.map((s) => s.note)].filter((n): n is string => !!n),
    });
  }
  for (const s of input.solicitudes) {
    if (s.ingrediente_id || !s.nombre) continue;
    lineas.push({
      key: s.id, ingredienteId: null, nombre: s.nombre, proveedorId: null, nivel: null, stock: null,
      qty: s.qty ?? 1, legible: null, motivos: ["solicitud"], solicitudIds: [s.id], faltanteIds: [], notas: s.note ? [s.note] : [],
    });
  }
  const peso = (l: LineaPedir) => (l.nivel === "rojo" ? 0 : l.nivel === "amarillo" ? 1 : 2);
  return lineas.sort((a, b) => peso(a) - peso(b) || a.nombre.localeCompare(b.nombre, "es"));
}

export interface ProveedorPedido {
  id: string;
  name: string;
  whatsapp: string | null;
  dias_pedido_idx: number[];
  entrega_dias: number;
}

/** Today is one of the supplier's order days. No fixed days = any day. */
export function tocaHoy(dias: ReadonlyArray<number>, todayIdx: number): boolean {
  return dias.length === 0 || dias.includes(todayIdx);
}

/** Days until the supplier's next order day (0 = today); null when it has none set. */
export function diasParaPedir(dias: ReadonlyArray<number>, todayIdx: number): number | null {
  if (!dias.length) return null;
  return Math.min(...dias.map((d) => (d - todayIdx + 7) % 7));
}

/** "lun · jue", or "cualquier día". */
export function diasLegibles(dias: ReadonlyArray<number>): string {
  return dias.length ? [...dias].sort((a, b) => a - b).map((d) => DIAS_CORTOS[d]).join(" · ") : "cualquier día";
}

export interface GrupoPedir {
  proveedor: ProveedorPedido | null;
  toca: boolean;
  /** Days until its next order day; null = no fixed days. */
  faltan: number | null;
  lineas: LineaPedir[];
}

/** The list by supplier: who is due today first, then by how soon; no supplier last. */
export function agruparPorProveedor(lineas: ReadonlyArray<LineaPedir>, proveedores: ReadonlyArray<ProveedorPedido>, todayIdx: number): GrupoPedir[] {
  const grupos: GrupoPedir[] = [];
  for (const p of proveedores) {
    const ls = lineas.filter((l) => l.proveedorId === p.id);
    if (ls.length) grupos.push({ proveedor: p, toca: tocaHoy(p.dias_pedido_idx, todayIdx), faltan: diasParaPedir(p.dias_pedido_idx, todayIdx), lineas: ls });
  }
  grupos.sort((a, b) => (a.faltan ?? 0) - (b.faltan ?? 0) || a.proveedor!.name.localeCompare(b.proveedor!.name, "es"));
  const known = new Set(proveedores.map((p) => p.id));
  const sueltas = lineas.filter((l) => !l.proveedorId || !known.has(l.proveedorId));
  if (sueltas.length) grupos.push({ proveedor: null, toca: true, faltan: null, lineas: sueltas });
  return grupos;
}

/** The order as it is sent: short, one line per item, in the supplier's terms. */
export function mensajePedido(input: { negocio: string; folio: number; lineas: ReadonlyArray<{ nombre: string; cantidad: string }>; nota?: string | null }): string {
  const cuerpo = input.lineas.map((l) => `• ${l.cantidad} — ${l.nombre}`).join("\n");
  return [`Hola, pedido de ${input.negocio} (n.º ${input.folio}):`, cuerpo, input.nota?.trim() ? input.nota.trim() : null, "¿Me confirmas disponibilidad y valor? Gracias."].filter(Boolean).join("\n\n");
}

/** wa.me link with the text ready; null without a number. */
export function waLink(whatsapp: string | null, texto: string): string | null {
  const d = (whatsapp ?? "").replace(/\D/g, "");
  return d ? `https://wa.me/${d}?text=${encodeURIComponent(texto)}` : null;
}

/** YYYY-MM-DD `dias` after `today` (both calendar dates, no clock involved). */
export function fechaMas(today: string, dias: number): string {
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}
