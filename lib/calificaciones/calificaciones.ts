/**
 * The customer's rating behind the QR on the cup, pure (no I/O; tested in
 * calificaciones.test.ts): the one-use code, the Instagram handle as it is
 * stored, the points a purchase earns and what a link is worth right now.
 */

/** No 0/O, 1/I/L: a code someone may have to type from a wrinkled label. */
const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const LARGO_CODIGO = 10;
const CODIGO_RE = new RegExp(`^[${ALFABETO}]{${LARGO_CODIGO}}$`);

/** A fresh one-use code. `bytes` is injectable for the tests. */
export function nuevoCodigo(bytes: Uint8Array = crypto.getRandomValues(new Uint8Array(LARGO_CODIGO))): string {
  let out = "";
  for (let i = 0; i < LARGO_CODIGO; i++) out += ALFABETO[bytes[i] % ALFABETO.length];
  return out;
}

/** Upper-cased code when it has the shape of one, else null. */
export function leerCodigo(raw: string): string | null {
  const c = raw.trim().toUpperCase();
  return CODIGO_RE.test(c) ? c : null;
}

/** Where the label's QR points. Short on purpose: it has to fit a 28 mm label. */
export const BASE_CALIFICACION = "https://cafepayo.com/c/";
export function urlCalificacion(codigo: string): string {
  return BASE_CALIFICACION + codigo;
}

/**
 * An Instagram handle the way it is stored: no "@", lower case. Accepts what
 * people paste — "@Cafe.Payo", "instagram.com/cafe.payo/", with spaces — and
 * returns null for anything that cannot be a handle.
 */
export function normalizarInstagram(raw: string): string | null {
  const h = raw
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^(www\.)?instagram\.com\//i, "")
    .replace(/[/?#].*$/, "")
    .replace(/^@+/, "")
    .toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(h) && !/^\.|\.$|\.\./.test(h) ? h : null;
}

/** What one person asked for, as the rating keeps it ("su café"). */
export interface ItemCalificado {
  name: string;
  qty: number;
  /** Chosen options, in words ("En leche"). */
  opciones: string[];
}

/** One point per $1.000 of what that person bought. */
export const PESOS_POR_PUNTO = 1000;
export function puntosDe(lineas: ReadonlyArray<{ unit_price_cop: number; qty: number }>): number {
  const total = lineas.reduce((n, l) => n + Math.max(0, l.unit_price_cop) * Math.max(0, l.qty), 0);
  return Math.floor(total / PESOS_POR_PUNTO);
}

/**
 * The lines of an order that belong to a label: the person's own when the
 * label names one, the unassigned ones when the ticket has people and the
 * label is the table's, the whole order when nobody was named.
 */
export function lineasDe<T extends { customer_name: string | null }>(lineas: ReadonlyArray<T>, customer: string | null, people: ReadonlyArray<string>): T[] {
  const who = (customer ?? "").trim();
  if (who && people.includes(who)) return lineas.filter((l) => (l.customer_name ?? "").trim() === who);
  if (people.length === 0) return [...lineas];
  return lineas.filter((l) => !people.includes((l.customer_name ?? "").trim()));
}

/**
 * The lines one QR is worth. A QR printed for one cup (`linea` = its ticket
 * line) is worth one unit of that drink; the person's first cup (`resto`)
 * also takes the lines no cup was printed for (food, bottles), so the QRs of
 * a person add up to what they bought, never more. `copas` = the lines that
 * got a cup QR. No `linea` (older QRs) = everything the person bought.
 */
export function lineasDeQr<T extends { customer_name: string | null; position: number; qty: number }>(
  lineas: ReadonlyArray<T>,
  customer: string | null,
  people: ReadonlyArray<string>,
  qr: { linea: number | null; resto: boolean },
  copas: ReadonlySet<number>,
): T[] {
  const grupo = lineasDe(lineas, customer, people);
  if (qr.linea === null) return grupo;
  const copa = grupo.find((l) => l.position === qr.linea);
  const out: T[] = copa ? [{ ...copa, qty: Math.min(1, copa.qty) }] : [];
  if (qr.resto) out.push(...grupo.filter((l) => !copas.has(l.position)));
  return out;
}

export type EstadoEnlace = "valido" | "usado" | "vencido" | "desconocido";
export function estadoDe(fila: { usada_at: string | null; expira_at: string } | null, ahora: Date = new Date()): EstadoEnlace {
  if (!fila) return "desconocido";
  if (fila.usada_at) return "usado";
  return new Date(fila.expira_at).getTime() <= ahora.getTime() ? "vencido" : "valido";
}

/** "tu Latte frío", "tu pedido" when it was more than one thing. */
export function tuPedido(items: ReadonlyArray<ItemCalificado>): string {
  return items.length === 1 && items[0].qty === 1 ? `tu ${items[0].name}` : "tu pedido";
}

/** The day of a customer's last visit as the points page says it: "23 de octubre", with the year only when it is not this one (Bogotá time). */
export function diaDeVisita(iso: string, ahora: Date = new Date()): string {
  const tz = "America/Bogota";
  const fecha = new Date(iso);
  const anio = (d: Date) => new Intl.DateTimeFormat("es-CO", { timeZone: tz, year: "numeric" }).format(d);
  const mismoAnio = anio(fecha) === anio(ahora);
  return new Intl.DateTimeFormat("es-CO", { timeZone: tz, day: "numeric", month: "long", ...(mismoAnio ? {} : { year: "numeric" }) }).format(fecha);
}

/** A ticket line as the cup QRs follow it across an edit. */
export interface LineaCopa {
  position: number;
  kind: string;
  producto_id: string | null;
  combo_id: string | null;
  name: string;
  mods: unknown;
  customer_name: string | null;
}
export interface QrCopa { id: string; linea_position: number | null; customer_name: string | null }

const modsClave = (mods: unknown) =>
  JSON.stringify(Object.entries((mods ?? {}) as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => [k, Array.isArray(v) ? [...v].sort() : v])
    .sort(([a], [b]) => String(a).localeCompare(String(b))));
const producto = (l: LineaCopa) => `${l.kind}:${l.producto_id ?? l.combo_id ?? l.name}`;
const nombre = (s: string | null) => (s ?? "").trim() || null;

/**
 * Editing a pending order (or giving its lines to people) replaces every line
 * and renumbers them, but the cup labels — and their QRs — were already
 * printed. Each QR keeps following ITS drink: the same product with the same
 * options (else the same product), preferring the same person and then the
 * nearest place. The QR also takes the person the drink now belongs to, so a
 * cup given to «Xiommy» later is still worth that cup. A drink that was taken
 * off the order sends its QRs past the last line (worth no cup). Reprints of
 * one cup move together. Returns only the QRs that change.
 */
export function reubicarCopas(viejas: ReadonlyArray<LineaCopa>, nuevas: ReadonlyArray<LineaCopa>, qrs: ReadonlyArray<QrCopa>): QrCopa[] {
  const porPos = new Map(viejas.map((l) => [l.position, l]));
  const usadas = new Set<number>();
  const destino = new Map<number, LineaCopa | null>();
  const conCopa = [...new Set(qrs.map((q) => q.linea_position).filter((p): p is number => p !== null && porPos.has(p)))].sort((a, b) => a - b);
  // Best pairs first, across all cups: exact options, then the same person, then the nearest place.
  const pares: { p: number; n: LineaCopa; rank: [number, number, number] }[] = [];
  for (const p of conCopa) {
    const v = porPos.get(p)!;
    for (const n of nuevas) {
      if (producto(n) !== producto(v)) continue;
      pares.push({ p, n, rank: [Number(modsClave(n.mods) !== modsClave(v.mods)), Number(nombre(n.customer_name) !== nombre(v.customer_name)), Math.abs(n.position - v.position)] });
    }
  }
  pares.sort((x, y) => x.rank[0] - y.rank[0] || x.rank[1] - y.rank[1] || x.rank[2] - y.rank[2] || x.p - y.p);
  for (const { p, n } of pares) {
    if (destino.has(p) || usadas.has(n.position)) continue;
    usadas.add(n.position);
    destino.set(p, n);
  }
  const fuera = new Map<number, number>();
  let siguiente = Math.max(nuevas.length, ...nuevas.map((n) => n.position + 1), ...qrs.map((q) => (q.linea_position ?? -1) + 1));
  const out: QrCopa[] = [];
  for (const q of qrs) {
    if (q.linea_position === null) continue;
    const n = destino.get(q.linea_position);
    let next: QrCopa;
    if (n) next = { id: q.id, linea_position: n.position, customer_name: nombre(n.customer_name) };
    else {
      // Drink gone (or a QR already past the end): park it past the last line, one place per cup.
      if (!fuera.has(q.linea_position)) fuera.set(q.linea_position, siguiente++);
      next = { id: q.id, linea_position: fuera.get(q.linea_position)!, customer_name: q.customer_name };
    }
    if (next.linea_position !== q.linea_position || nombre(next.customer_name) !== nombre(q.customer_name)) out.push(next);
  }
  return out;
}
