/**
 * «¿Qué se está acabando?» — the tablet's inventory screen, pure (no I/O;
 * tested in acabando.test.ts). Every item of the list is in one of three
 * states the barista sets with one tap (hay · poco · agotado); an item on its
 * way in an open order shows «en camino»; something that is not on the list
 * can be added and waits for the owner. DB reads: acabando-db.ts; writes:
 * app/turno/inventario/actions.ts.
 *
 * States in the DB (inventario_faltantes.estado) are ok · bajo · agotado; the
 * screen says hay · poco · agotado. An item with no open report is «hay».
 */
import { ZONAS } from "./niveles";
import type { FaltanteEstado } from "./faltantes";

export type Marca = "hay" | "poco" | "agotado";
export type ZonaAcabando = (typeof ZONAS)[number] | "Otros";
/** The rail: the flagged items of every zone, or one zone. */
export type Vista = "marcado" | ZonaAcabando;

export const MARCAS: Record<Marca, { label: string; boton: string; estado: FaltanteEstado }> = {
  hay: { label: "Hay", boton: "HAY", estado: "ok" },
  poco: { label: "Poco", boton: "POCO", estado: "bajo" },
  agotado: { label: "Agotado", boton: "AGOTADO", estado: "agotado" },
};

export function marcaDe(estado: FaltanteEstado | null | undefined): Marca {
  return estado === "agotado" ? "agotado" : estado === "bajo" ? "poco" : "hay";
}

/** Short notes one tap away. */
export const NOTAS_RAPIDAS = ["queda media bolsa", "queda 1", "casi vacío"] as const;

export interface InsumoBase {
  id: string;
  name: string;
  unit: string;
  ubicacion: string | null;
  pack_label: string | null;
  pieza_qty: number | null;
}

export interface ReporteAbierto {
  ingrediente_id: string;
  estado: FaltanteEstado;
  reported_at: string;
  reported_by_name: string | null;
  note: string | null;
}

/** An item in an open order (compras.status = 'pedido'). */
export interface EnCamino {
  ingrediente_id: string;
  proveedor: string | null;
  /** YYYY-MM-DD, when the supplier should bring it. */
  entrega_esperada: string | null;
}

/** Something the team added that is not on the list yet (inventario_sugerencias tipo «nuevo»). */
export interface NuevoPendiente {
  id: string;
  nombre: string;
  zona: string;
  estado: "bajo" | "agotado" | null;
  nota: string | null;
  by: string | null;
  at: string;
}

export interface Insumo {
  id: string;
  name: string;
  /** How it sits on the shelf: «bolsa 900 ml», «und». */
  pack: string;
  zona: ZonaAcabando;
  marca: Marca;
  by: string | null;
  at: string | null;
  note: string | null;
  /** «llega jueves» when it is in an open order. */
  pedido: string | null;
  /** Added from the tablet, not on the list yet: nothing to tap. */
  nuevo: boolean;
}

/** Where an item lives on the rail; anything outside the walked zones is «Otros». */
export function zonaDe(ubicacion: string | null | undefined): ZonaAcabando {
  const u = (ubicacion ?? "").trim().toLowerCase();
  return ZONAS.find((z) => z.toLowerCase() === u) ?? "Otros";
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100).replace(".", ","));

/** «bolsa 900 ml» when the item is counted in pieces, «bolsa» with only a label, else its unit. */
export function presentacion(it: Pick<InsumoBase, "unit" | "pack_label" | "pieza_qty">): string {
  const label = it.pack_label?.trim();
  const pieza = Number(it.pieza_qty ?? 0);
  if (label && pieza > 0) return `${label} ${fmt(pieza)} ${it.unit}`;
  if (label) return label;
  return it.unit;
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);
}

/** «llega hoy», «llega mañana», «llega jueves» (this week), «llega el 3 nov»; «ya debía llegar» when late. */
export function llegaLabel(entrega: string | null, today: string): string {
  if (!entrega) return "pedido";
  const d = diasEntre(today, entrega);
  if (d < 0) return "ya debía llegar";
  if (d === 0) return "llega hoy";
  if (d === 1) return "llega mañana";
  const [y, m, day] = entrega.split("-").map(Number);
  if (d < 7) return `llega ${DIAS[new Date(Date.UTC(y, m - 1, day)).getUTCDay()]}`;
  return `llega el ${day} ${MESES[m - 1]}`;
}

/**
 * Bogotá's wall clock for an instant, without Intl: the server and the
 * tablet's browser format dates differently (hydration), and Colombia has no
 * daylight saving, so UTC−5 is exact.
 */
export function horaLocal(iso: string, offsetMin = -300): { fecha: string; hora: string } {
  const t = new Date(Date.parse(iso) + offsetMin * 60_000);
  const hh = t.getUTCHours();
  const mm = String(t.getUTCMinutes()).padStart(2, "0");
  return { fecha: t.toISOString().slice(0, 10), hora: `${hh}:${mm}` };
}

/** «10:32» today, «ayer», or «22 oct». */
export function cuando(iso: string | null, today: string): string {
  if (!iso) return "";
  const { fecha, hora } = horaLocal(iso);
  if (fecha === today) return hora;
  if (diasEntre(fecha, today) === 1) return "ayer";
  const [, m, d] = fecha.split("-").map(Number);
  return `${d} ${MESES[m - 1]}`;
}

/** Accent- and case-insensitive text for the search box. */
export function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** The whole list as the screen reads it: one row per item plus the new ones waiting for the owner. */
export function buildInsumos(input: {
  items: ReadonlyArray<InsumoBase>;
  abiertos: ReadonlyArray<ReporteAbierto>;
  camino: ReadonlyArray<EnCamino>;
  nuevos: ReadonlyArray<NuevoPendiente>;
  today: string;
}): Insumo[] {
  const open = new Map<string, ReporteAbierto>();
  for (const a of input.abiertos) {
    const prev = open.get(a.ingrediente_id);
    if (!prev || a.reported_at > prev.reported_at) open.set(a.ingrediente_id, a);
  }
  const camino = new Map<string, EnCamino>();
  for (const c of input.camino) {
    const prev = camino.get(c.ingrediente_id);
    // The soonest delivery wins when two orders carry the same item.
    if (!prev || (c.entrega_esperada ?? "9999") < (prev.entrega_esperada ?? "9999")) camino.set(c.ingrediente_id, c);
  }
  const rows: Insumo[] = input.items.map((it) => {
    const r = open.get(it.id);
    const c = camino.get(it.id);
    return {
      id: it.id,
      name: it.name,
      pack: presentacion(it),
      zona: zonaDe(it.ubicacion),
      marca: marcaDe(r?.estado),
      by: r?.reported_by_name ?? null,
      at: r?.reported_at ?? null,
      note: r?.note ?? null,
      pedido: c ? llegaLabel(c.entrega_esperada, input.today) : null,
      nuevo: false,
    };
  });
  for (const n of input.nuevos) {
    rows.push({
      id: `nuevo:${n.id}`,
      name: n.nombre,
      pack: "por definir",
      zona: zonaDe(n.zona),
      marca: n.estado === "bajo" ? "poco" : "agotado",
      by: n.by,
      at: n.at,
      note: n.nota,
      pedido: null,
      nuevo: true,
    });
  }
  return rows;
}

/** A mark the owner should act on: poco or agotado and not already ordered. */
export const marcado = (x: Pick<Insumo, "marca" | "pedido">) => !x.pedido && x.marca !== "hay";

const rank = (x: Insumo) => (x.pedido ? 2 : x.marca === "agotado" ? 0 : 1);
const porNombre = (a: Insumo, b: Insumo) => a.name.localeCompare(b.name, "es");

export function contar(rows: ReadonlyArray<Insumo>): { poco: number; agotado: number; camino: number } {
  const c = { poco: 0, agotado: 0, camino: 0 };
  for (const x of rows) {
    if (x.pedido) c.camino += 1;
    else if (x.marca === "poco") c.poco += 1;
    else if (x.marca === "agotado") c.agotado += 1;
  }
  return c;
}

/** The zones that have items, in walking order, «Otros» last. */
export function zonasCon(rows: ReadonlyArray<Insumo>): ZonaAcabando[] {
  const all: ZonaAcabando[] = [...ZONAS, "Otros"];
  return all.filter((z) => rows.some((x) => x.zona === z));
}

export interface RailEntry {
  vista: Vista;
  label: string;
  sub: string;
  flags: number;
  /** Something in it is agotado: the badge turns red. */
  urgente: boolean;
}

export function rail(rows: ReadonlyArray<Insumo>): RailEntry[] {
  const entry = (vista: Vista, label: string, pool: ReadonlyArray<Insumo>, sub: string): RailEntry => {
    const flagged = pool.filter(marcado);
    return { vista, label, sub, flags: flagged.length, urgente: flagged.some((x) => x.marca === "agotado") };
  };
  return [
    entry("marcado", "Lo marcado", rows, "todas las zonas"),
    ...zonasCon(rows).map((z) => {
      const pool = rows.filter((x) => x.zona === z);
      return entry(z, z, pool, `${pool.length} ${pool.length === 1 ? "insumo" : "insumos"}`);
    }),
  ];
}

export interface Seccion {
  label: string;
  /** Rows show their zone (search and «Lo marcado» mix zones). */
  conZona: boolean;
  items: Insumo[];
}

export interface VistaArmada {
  titulo: string;
  sub: string;
  secciones: Seccion[];
  /** A search with no hit: offer to add it. */
  sinResultados: boolean;
  /** «Lo marcado» is empty: everything is in order. */
  todoEnOrden: boolean;
}

/**
 * What the main pane shows. A search looks in every zone; «Lo marcado» is
 * what is short (agotado first) plus what is on its way; a zone shows its
 * marked items on top and the rest A–Z.
 */
export function armarVista(rows: ReadonlyArray<Insumo>, vista: Vista, q: string): VistaArmada {
  const nq = normalizar(q);
  if (nq) {
    const hits = rows.filter((x) => normalizar(x.name).includes(nq)).sort((a, b) => rank(a) - rank(b) || porNombre(a, b));
    return {
      titulo: "Resultados",
      sub: `${hits.length} en todas las zonas`,
      secciones: hits.length ? [{ label: `COINCIDEN CON «${q.trim().toUpperCase()}»`, conZona: true, items: hits }] : [],
      sinResultados: hits.length === 0,
      todoEnOrden: false,
    };
  }
  if (vista === "marcado") {
    const marked = rows.filter(marcado).sort((a, b) => rank(a) - rank(b) || porNombre(a, b));
    const camino = rows.filter((x) => x.pedido).sort(porNombre);
    const zonas = new Set(rows.map((x) => x.zona)).size;
    const secciones: Seccion[] = [];
    if (marked.length) secciones.push({ label: "POR PEDIR · AGOTADO PRIMERO", conZona: true, items: marked });
    if (camino.length) secciones.push({ label: "EN CAMINO", conZona: true, items: camino });
    return {
      titulo: "Lo marcado",
      sub: `${marked.length} por pedir en ${zonas === 1 ? "la zona" : `las ${zonas} zonas`}`,
      secciones,
      sinResultados: false,
      todoEnOrden: marked.length === 0,
    };
  }
  const zi = rows.filter((x) => x.zona === vista);
  const top = zi.filter((x) => x.marca !== "hay" || x.pedido).sort((a, b) => rank(a) - rank(b) || porNombre(a, b));
  const rest = zi.filter((x) => x.marca === "hay" && !x.pedido).sort(porNombre);
  const secciones: Seccion[] = [];
  if (top.length) secciones.push({ label: "MARCADOS Y EN CAMINO", conZona: false, items: top });
  if (rest.length) secciones.push({ label: "LO DEMÁS · A–Z", conZona: false, items: rest });
  return {
    titulo: vista,
    sub: `${zi.length} ${zi.length === 1 ? "insumo" : "insumos"} · ${zi.filter(marcado).length} marcados`,
    secciones,
    sinResultados: false,
    todoEnOrden: false,
  };
}

/** The line under the name. `guardado` = it was just saved (4 s); `enEspera` = saved on the tablet, not sent yet. */
export function metaInsumo(x: Insumo, today: string, opts: { guardado?: boolean; enEspera?: boolean; conZona?: boolean } = {}): string {
  let meta: string;
  if (opts.guardado) meta = `Guardado ✓ · ${MARCAS[x.marca].label} · ${x.by ?? ""} · ahora`.replace(" ·  ·", " ·");
  else if (x.pedido) meta = `Pedido · ${x.pedido}${x.marca === "agotado" ? " · ya se agotó" : ""}`;
  else if (x.marca === "hay") meta = x.pack;
  else meta = [MARCAS[x.marca].label, x.by, cuando(x.at, today)].filter(Boolean).join(" · ");
  if (opts.enEspera && !opts.guardado) meta += " · en espera";
  if (x.note && !opts.guardado) meta += ` · “${x.note}”`;
  // The row's tag already says the owner reviews it.
  if (x.nuevo) meta = `Nuevo · ${meta}`;
  if (opts.conZona) meta = `${x.zona} · ${meta}`;
  return meta;
}

/** A tap kept on the tablet until it reaches the server (offline, or a failed send). */
export interface MarcaPendiente {
  ingredienteId: string;
  marca: Marca;
  note: string | null;
  /** When it was tapped (ISO). */
  at: string;
  by: string;
}

/** The list with the taps that have not reached the server laid over it. */
export function conPendientes(rows: ReadonlyArray<Insumo>, pendientes: ReadonlyArray<MarcaPendiente>): Insumo[] {
  if (!pendientes.length) return rows as Insumo[];
  const last = new Map<string, MarcaPendiente>();
  for (const p of pendientes) last.set(p.ingredienteId, p);
  return rows.map((x) => {
    const p = last.get(x.id);
    return p ? { ...x, marca: p.marca, note: p.note, by: p.by, at: p.at } : x;
  });
}

/** Queue a tap: the newest tap of an item replaces the older one (only the last state matters). */
export function encolar(cola: ReadonlyArray<MarcaPendiente>, m: MarcaPendiente): MarcaPendiente[] {
  return [...cola.filter((p) => p.ingredienteId !== m.ingredienteId), m];
}

/** Items of the list that look like what is being typed, so nobody creates a repeated one. */
export function parecidosA(nombre: string, rows: ReadonlyArray<Insumo>, limit = 4): Insumo[] {
  const words = normalizar(nombre).split(/\s+/).filter((w) => w.length >= 3);
  if (!words.length) return [];
  return rows.filter((x) => !x.nuevo && words.some((w) => normalizar(x.name).includes(w))).slice(0, limit);
}
