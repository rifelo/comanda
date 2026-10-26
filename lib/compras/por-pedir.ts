/**
 * «Por pedir» on the owner's phone (the mobile layer of /compras), pure (no
 * I/O; tested in por-pedir.test.ts): what the team marked on the tablet as
 * poco or agotado, grouped by supplier with whoever has something agotado
 * first, each line with a suggested quantity the owner nudges before sending
 * the WhatsApp. Only what someone marked or asked for: the system's own level
 * alerts stay on the desktop list.
 */
import { cantidadLegible, type NivelItem } from "@/lib/inventario/niveles";
import { cuando } from "@/lib/inventario/acabando";
import { mensajePedido, type LineaPedir, type PedirItem, type ProveedorPedido } from "./compras";

export interface FaltanteMarcado {
  ingrediente_id: string;
  estado: "ok" | "bajo" | "agotado";
  reported_at: string;
  reported_by_name: string | null;
  note: string | null;
}

export interface PorPedirLinea {
  key: string;
  ingredienteId: string | null;
  nombre: string;
  marca: "poco" | "agotado";
  /** «Andrés · 10:41 · “queda media bolsa”». */
  meta: string;
  /** Suggested quantity, stock units. */
  qty: number;
  /** One purchase lot: what − and + move by, and the least that can be ordered. */
  paso: number;
}

export interface PorPedirGrupo {
  /** null = items with no supplier set. */
  proveedorId: string | null;
  nombre: string;
  whatsapp: string | null;
  agotados: number;
  lineas: PorPedirLinea[];
}

/** One lot of an item: the pack it is bought in, else its piece, else one unit. */
export function pasoDe(it: Pick<NivelItem, "pack_qty" | "pieza_qty"> | undefined): number {
  const pack = Number(it?.pack_qty ?? 0);
  if (pack > 0) return pack;
  const pieza = Number(it?.pieza_qty ?? 0);
  return pieza > 0 ? pieza : 1;
}

/** The quantity the way it is said («2 bolsas»); free-text lines are plain units. */
export function qtyLegible(qty: number, it: (NivelItem & { unit: string }) | undefined): string {
  if (!it) return `${qty} und`;
  return cantidadLegible(qty, it);
}

/** − / +: one lot at a time, never under one lot. */
export function ajustar(qty: number, paso: number, dir: 1 | -1): number {
  const n = Math.round((qty + dir * paso) * 1000) / 1000;
  return Math.max(paso, n);
}

export function buildPorPedirMovil(input: {
  lineas: ReadonlyArray<LineaPedir>;
  items: ReadonlyArray<PedirItem>;
  faltantes: ReadonlyArray<FaltanteMarcado>;
  proveedores: ReadonlyArray<ProveedorPedido>;
  today: string;
}): PorPedirGrupo[] {
  const itemById = new Map(input.items.map((i) => [i.id, i]));
  const peor = new Map<string, FaltanteMarcado>();
  for (const f of input.faltantes) {
    if (f.estado === "ok") continue;
    const prev = peor.get(f.ingrediente_id);
    if (!prev || (f.estado === "agotado" && prev.estado !== "agotado") || (f.estado === prev.estado && f.reported_at > prev.reported_at)) peor.set(f.ingrediente_id, f);
  }
  const marcadas = input.lineas.filter((l) => l.motivos.includes("faltante") || l.motivos.includes("solicitud"));
  const grupos = new Map<string, PorPedirGrupo>();
  for (const l of marcadas) {
    const f = l.ingredienteId ? peor.get(l.ingredienteId) : undefined;
    const it = l.ingredienteId ? itemById.get(l.ingredienteId) : undefined;
    const prov = l.proveedorId ? input.proveedores.find((p) => p.id === l.proveedorId) : undefined;
    const gk = prov?.id ?? "";
    if (!grupos.has(gk)) grupos.set(gk, { proveedorId: prov?.id ?? null, nombre: prov?.name ?? "Sin proveedor", whatsapp: prov?.whatsapp ?? null, agotados: 0, lineas: [] });
    const g = grupos.get(gk)!;
    const marca = f?.estado === "agotado" ? "agotado" : "poco";
    if (marca === "agotado") g.agotados += 1;
    const notas = [...new Set(l.notas)].map((n) => `“${n}”`);
    const meta = f
      ? [f.reported_by_name, cuando(f.reported_at, input.today), ...notas].filter(Boolean).join(" · ")
      : ["lo pidió el equipo", ...notas].join(" · ");
    const paso = pasoDe(it);
    g.lineas.push({ key: l.key, ingredienteId: l.ingredienteId, nombre: l.nombre, marca, meta, qty: Math.max(paso, l.qty), paso });
  }
  const out = [...grupos.values()];
  for (const g of out) g.lineas.sort((a, b) => (a.marca === "agotado" ? 0 : 1) - (b.marca === "agotado" ? 0 : 1) || a.nombre.localeCompare(b.nombre, "es"));
  // Whoever has something agotado first; items with no supplier last.
  return out.sort((a, b) => (a.proveedorId ? 0 : 1) - (b.proveedorId ? 0 : 1) || (b.agotados > 0 ? 1 : 0) - (a.agotados > 0 ? 1 : 0) || a.nombre.localeCompare(b.nombre, "es"));
}

/** The message as it will go out, before the order exists (no folio yet). */
export function vistaMensaje(negocio: string, lineas: ReadonlyArray<{ nombre: string; cantidad: string }>): string {
  return mensajePedido({ negocio, folio: 0, lineas }).replace(" (n.º 0)", "");
}

export function totales(grupos: ReadonlyArray<PorPedirGrupo>, nuevos: ReadonlyArray<{ estado: "bajo" | "agotado" | null }>): { total: number; agotados: number } {
  const lineas = grupos.reduce((n, g) => n + g.lineas.length, 0);
  const agot = grupos.reduce((n, g) => n + g.agotados, 0) + nuevos.filter((n) => n.estado === "agotado").length;
  return { total: lineas + nuevos.length, agotados: agot };
}
