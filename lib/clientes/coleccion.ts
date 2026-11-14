// «Mi colección» and the recognition badges of Mi Pa'Yo (owner, 2026-11-14).
// Points stay $1.000 = 1 and pay for rewards; the collection is the fun,
// visible layer: one card per drink of the menu, how many times you had it,
// and badges for habits (morning, streaks, exploring, completing a group).
// Pure and tested; loaders in mi-payo-db.ts.

import { bogota, ordenarRanking, porBebida, rachaMasLarga, type Escaneo, type FilaRanking } from "./mi-payo";
import { HORA_FIN_MANANA } from "./premios";

export type Grupo = "Calientes" | "Frías" | "Jugos" | "Kombuchas";
export const GRUPOS: readonly Grupo[] = ["Calientes", "Frías", "Jugos", "Kombuchas"];
/** POS category label → album group (bottles and food are not collected). */
export const GRUPO_DE: Readonly<Record<string, Grupo>> = { Caliente: "Calientes", Frío: "Frías", Jugos: "Jugos", Kombucha: "Kombuchas" };

/** One drink of the current menu. */
export interface BebidaCarta { nombre: string; grupo: Grupo }

export interface Carta { nombre: string; veces: number }
export interface GrupoColeccion { grupo: Grupo; descubiertas: number; total: number; cartas: Carta[] }
export interface Coleccion {
  /** Drinks had, all time. */
  bebidas: number;
  /** Different menu drinks tried, out of `carta`. */
  descubiertas: number;
  carta: number;
  grupos: GrupoColeccion[];
  /** Drinks had that are no longer on the menu (renamed or retired). */
  pasadas: Carta[];
}

const clave = (s: string) => s.trim().toLocaleLowerCase("es");

/**
 * The album: every menu drink by group (tried ones first, most had first),
 * plus retired ones. `fuera` = names of current products that are not
 * collected (bottles, food), so a Coca-Cola never shows as a retired drink.
 */
export function coleccion(es: ReadonlyArray<Escaneo>, carta: ReadonlyArray<BebidaCarta>, fuera: Iterable<string> = []): Coleccion {
  const excluir = new Set([...fuera].map(clave));
  const veces = new Map(porBebida(es).filter((d) => !excluir.has(clave(d.nombre))).map((d) => [clave(d.nombre), d]));
  const enCarta = new Set(carta.map((b) => clave(b.nombre)));
  const grupos = GRUPOS.map((grupo) => {
    const cartas = carta
      .filter((b) => b.grupo === grupo)
      .map((b) => ({ nombre: b.nombre, veces: veces.get(clave(b.nombre))?.veces ?? 0 }))
      .sort((a, b) => b.veces - a.veces || a.nombre.localeCompare(b.nombre, "es"));
    return { grupo, descubiertas: cartas.filter((c) => c.veces > 0).length, total: cartas.length, cartas };
  }).filter((g) => g.total > 0);
  const pasadas = [...veces.entries()].filter(([k]) => !enCarta.has(k)).map(([, d]) => ({ nombre: d.nombre, veces: d.veces }));
  return {
    bebidas: [...veces.values()].reduce((n, d) => n + d.veces, 0),
    descubiertas: grupos.reduce((n, g) => n + g.descubiertas, 0),
    carta: grupos.reduce((n, g) => n + g.total, 0),
    grupos,
    pasadas,
  };
}

export interface Insignia {
  id: string;
  nombre: string;
  /** How it is earned (or what it says once earned). */
  detalle: string;
  ganada: boolean;
  /** Toward the next level (or the badge itself when not yet earned). */
  progreso: { actual: number; meta: number } | null;
}

/** Longest run of consecutive Bogotá days with at least one drink. */
export function rachaDiasMasLarga(es: ReadonlyArray<Escaneo>): number {
  const dias = [...new Set(es.filter((e) => e.items.some((i) => i.tipo !== "comida")).map((e) => bogota(e.at).dia))].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < dias.length; i++) {
    run = i > 0 && dias[i] - dias[i - 1] === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

/** Consecutive days with a drink up to today; still alive today if yesterday had one. */
export function rachaDiasActual(es: ReadonlyArray<Escaneo>, ahora: Date = new Date()): number {
  const dias = new Set(es.filter((e) => e.items.some((i) => i.tipo !== "comida")).map((e) => bogota(e.at).dia));
  let d = bogota(ahora).dia;
  if (!dias.has(d)) d -= 1;
  let n = 0;
  while (dias.has(d)) {
    n++;
    d -= 1;
  }
  return n;
}

/** A finished month's place in the ranking, for «Top del mes». */
export interface PodioMes { mes: string; puesto: number }

const nBebidas = (es: ReadonlyArray<Escaneo>) => es.reduce((n, e) => n + e.items.filter((i) => i.tipo !== "comida").reduce((k, i) => k + i.qty, 0), 0);

/** Laddered badge: the highest level reached, and progress to the next one. */
function escalera(id: string, valor: number, niveles: number[], nombre: (n: number) => string, detalle: (n: number) => string): Insignia {
  const hechos = niveles.filter((n) => valor >= n);
  const sig = niveles.find((n) => valor < n) ?? null;
  const nivel = hechos[hechos.length - 1];
  if (nivel === undefined) return { id, nombre: nombre(niveles[0]), detalle: detalle(niveles[0]), ganada: false, progreso: { actual: valor, meta: niveles[0] } };
  return { id, nombre: nombre(nivel), detalle: detalle(nivel), ganada: true, progreso: sig === null ? null : { actual: valor, meta: sig } };
}

/** Every badge, earned ones first. `podios` are finished months only. */
export function insignias(es: ReadonlyArray<Escaneo>, carta: ReadonlyArray<BebidaCarta>, podios: ReadonlyArray<PodioMes> = [], fuera: Iterable<string> = []): Insignia[] {
  const col = coleccion(es, carta, fuera);
  const total = nBebidas(es);
  const manana = es.reduce((n, e) => n + (bogota(e.at).h < HORA_FIN_MANANA ? e.items.filter((i) => i.tipo !== "comida").reduce((k, i) => k + i.qty, 0) : 0), 0);
  const fav = porBebida(es)[0];
  const grupo = (g: Grupo) => col.grupos.find((x) => x.grupo === g);
  const completo = (g: Grupo, id: string, nombre: string): Insignia | null => {
    const x = grupo(g);
    if (!x) return null;
    return { id, nombre, detalle: `Probaste las ${x.total} ${g.toLocaleLowerCase("es")} de la carta`, ganada: x.descubiertas >= x.total, progreso: x.descubiertas >= x.total ? null : { actual: x.descubiertas, meta: x.total } };
  };
  const top = podios.filter((p) => p.puesto <= 3);
  const lista: (Insignia | null)[] = [
    { id: "primer-sorbo", nombre: "Primer sorbo", detalle: "Tu primera bebida registrada", ganada: total >= 1, progreso: total >= 1 ? null : { actual: 0, meta: 1 } },
    escalera("cliente", total, [10, 25, 50, 100], (n) => `Cliente ${n}`, (n) => `${n} bebidas registradas`),
    { id: "madrugon", nombre: "Del madrugón", detalle: `5 bebidas antes de las ${HORA_FIN_MANANA}:00 a. m.`, ganada: manana >= 5, progreso: manana >= 5 ? null : { actual: manana, meta: 5 } },
    {
      id: "fiel",
      nombre: fav && fav.veces >= 5 ? `Fiel al ${fav.nombre}` : "Fiel a tu favorito",
      detalle: "5 veces la misma bebida",
      ganada: !!fav && fav.veces >= 5,
      progreso: fav && fav.veces >= 5 ? null : { actual: fav?.veces ?? 0, meta: 5 },
    },
    escalera("explorador", col.descubiertas, [5, 10, 20], (n) => (n === 5 ? "Explorador" : `Explorador ${n}`), (n) => `${n} bebidas distintas`),
    escalera("racha-dias", rachaDiasMasLarga(es), [3, 5, 10, 20], (n) => `Racha de ${n} días`, (n) => `${n} días seguidos con café`),
    escalera("racha", rachaMasLarga(es), [3, 6, 12], (n) => `${n} semanas seguidas`, (n) => `Café todas las semanas durante ${n} semanas`),
    completo("Frías", "todas-frias", "Todas las frías"),
    completo("Jugos", "todos-jugos", "Todos los jugos"),
    {
      id: "top-mes",
      nombre: "Top del mes",
      detalle: top.length ? `Top 3 del ranking en ${top.map((p) => p.mes).join(", ")}` : "Termina un mes en el top 3 del ranking",
      ganada: top.length > 0,
      progreso: null,
    },
  ];
  const todas = lista.filter((x): x is Insignia => x !== null);
  return [...todas.filter((i) => i.ganada), ...todas.filter((i) => !i.ganada)];
}

/** Badges earned with the last scan: earned now, not before it. */
export function nuevasInsignias(antes: ReadonlyArray<Insignia>, ahora: ReadonlyArray<Insignia>): string[] {
  const ya = new Set(antes.filter((i) => i.ganada).map((i) => `${i.id}:${i.nombre}`));
  return ahora.filter((i) => i.ganada && !ya.has(`${i.id}:${i.nombre}`)).map((i) => i.nombre);
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** A customer's place in each FINISHED month's ranking, from every paid QR. */
export function podiosDe(
  qrs: ReadonlyArray<{ clienteId: string; instagram: string; puntos: number; at: string }>,
  clienteId: string,
  ahora: Date = new Date(),
): PodioMes[] {
  const n = bogota(ahora);
  const actual = n.y * 12 + n.m;
  const porMes = new Map<number, Map<string, FilaRanking>>();
  for (const q of qrs) {
    const b = bogota(q.at);
    const k = b.y * 12 + b.m;
    if (k >= actual) continue;
    const m = porMes.get(k) ?? new Map<string, FilaRanking>();
    const f = m.get(q.clienteId) ?? { clienteId: q.clienteId, instagram: q.instagram, puntos: 0, bebidas: 0 };
    f.puntos += q.puntos;
    f.bebidas += 1;
    m.set(q.clienteId, f);
    porMes.set(k, m);
  }
  const out: PodioMes[] = [];
  for (const [k, m] of [...porMes.entries()].sort((a, b) => a[0] - b[0])) {
    const i = ordenarRanking([...m.values()]).findIndex((f) => f.clienteId === clienteId);
    if (i >= 0) out.push({ mes: `${MESES[k % 12]} ${Math.floor(k / 12)}`, puesto: i + 1 });
  }
  return out;
}
