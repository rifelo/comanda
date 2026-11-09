// «Mi Pa'Yo», the customers' app on cafepayo.com/puntos: points, history,
// insights and the ranking, all from the cup QRs a handle claimed (0049/0052).
// Pure and tested; the loaders live in mi-payo-db.ts. Times are Bogotá's
// (UTC−5 all year, no DST), worked out by hand so server and phone agree.

export type Tipo = "caliente" | "frio" | "comida";

/** One thing a QR paid points for. */
export interface ItemConsumo {
  nombre: string;
  qty: number;
  /** COP of this line as it paid points (one unit for a cup). */
  valor: number;
  tipo: Tipo;
}

/** One claimed QR: when the order was placed and what it paid points for. */
export interface Escaneo {
  /** The QR's row id (calificaciones). */
  id?: string;
  /** Order time, ISO. */
  at: string;
  puntos: number;
  items: ItemConsumo[];
}

const OFFSET_MS = 5 * 3600_000;
const DIA_MS = 86_400_000;

/** The Bogotá wall clock of an instant. `dia` counts days since 1970-01-01 there; `dow` 0 = lunes. */
export function bogota(iso: string | Date) {
  const t = (typeof iso === "string" ? new Date(iso) : iso).getTime() - OFFSET_MS;
  const d = new Date(t);
  const dia = Math.floor(t / DIA_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), min: d.getUTCMinutes(), dow: (d.getUTCDay() + 6) % 7, dia };
}
/** Days since 1970 of the Monday that starts the Bogotá week of an instant. */
export const semanaDe = (iso: string | Date) => {
  const b = bogota(iso);
  return b.dia - b.dow;
};
/** The first instant (UTC ISO) of a Bogotá calendar day number. */
const inicioDia = (dia: number) => new Date(dia * DIA_MS + OFFSET_MS);

export type PeriodoRanking = "semana" | "mes" | "todo";
export type PeriodoInsights = "mes" | "6m" | "todo";

/** From when a period counts (null = always). */
export function desdeDe(periodo: PeriodoRanking | PeriodoInsights, ahora: Date = new Date()): Date | null {
  const b = bogota(ahora);
  if (periodo === "semana") return inicioDia(b.dia - b.dow);
  if (periodo === "mes") return new Date(Date.UTC(b.y, b.m, 1) + OFFSET_MS);
  if (periodo === "6m") return new Date(Date.UTC(b.y, b.m - 5, 1) + OFFSET_MS);
  return null;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const DIA_CORTO = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`;
/** "$612K", "$1,2M" — for big tiles. */
export function pesosCortos(n: number): string {
  if (n >= 1_000_000) return `$${(Math.round(n / 100_000) / 10).toLocaleString("es-CO")}M`;
  if (n >= 10_000) return `$${Math.round(n / 1000)}K`;
  return pesos(n);
}
export const miles = (n: number) => Math.round(n).toLocaleString("es-CO");

/** "8:42 a. m." */
export function hora(iso: string): string {
  const { h, min } = bogota(iso);
  return `${h % 12 || 12}:${String(min).padStart(2, "0")} ${h < 12 ? "a. m." : "p. m."}`;
}
/** "Hoy", "Ayer", "Jue 5 nov" (with the year when it is not this one). */
export function diaCorto(iso: string, ahora: Date = new Date()): string {
  const b = bogota(iso);
  const n = bogota(ahora);
  if (b.dia === n.dia) return "Hoy";
  if (b.dia === n.dia - 1) return "Ayer";
  return `${DIA_CORTO[b.dow]} ${b.d} ${MES_CORTO[b.m].toLowerCase()}${b.y === n.y ? "" : ` ${b.y}`}`;
}
/** "marzo 2026" */
export const mesAnio = (iso: string) => {
  const b = bogota(iso);
  return `${MESES[b.m]} ${b.y}`;
};
/** "14 de octubre" (+ year when not this one). */
export function fechaLarga(iso: string, ahora: Date = new Date()): string {
  const b = bogota(iso);
  return `${b.d} de ${MESES[b.m]}${b.y === bogota(ahora).y ? "" : ` de ${b.y}`}`;
}

/**
 * Someone else's handle on the public ranking: enough to recognise yourself
 * or a friend, not enough to look a stranger up. «liseeeeeeeth» → «lis•••th».
 */
export function enmascarar(instagram: string): string {
  const h = instagram.replace(/^@/, "");
  if (h.length <= 4) return `@${h.slice(0, 1)}•••`;
  if (h.length <= 6) return `@${h.slice(0, 2)}•••${h.slice(-1)}`;
  return `@${h.slice(0, 3)}•••${h.slice(-2)}`;
}

const bebidas = (e: Escaneo) => e.items.filter((i) => i.tipo !== "comida");
const nBebidas = (es: ReadonlyArray<Escaneo>) => es.reduce((n, e) => n + bebidas(e).reduce((k, i) => k + i.qty, 0), 0);
const valorDe = (e: Escaneo) => e.items.reduce((n, i) => n + i.valor, 0);

function enPeriodo(es: ReadonlyArray<Escaneo>, desde: Date | null): Escaneo[] {
  return desde ? es.filter((e) => new Date(e.at).getTime() >= desde.getTime()) : [...es];
}

/** Drinks by name, most first (ties: the one ordered most recently first). */
export function porBebida(es: ReadonlyArray<Escaneo>): { nombre: string; veces: number }[] {
  const m = new Map<string, { veces: number; ultima: number }>();
  for (const e of es) {
    const t = new Date(e.at).getTime();
    for (const i of bebidas(e)) {
      const x = m.get(i.nombre) ?? { veces: 0, ultima: 0 };
      x.veces += i.qty;
      x.ultima = Math.max(x.ultima, t);
      m.set(i.nombre, x);
    }
  }
  return [...m.entries()].sort((a, b) => b[1].veces - a[1].veces || b[1].ultima - a[1].ultima).map(([nombre, x]) => ({ nombre, veces: x.veces }));
}

/** Longest run of consecutive Bogotá weeks with at least one visit. */
export function rachaMasLarga(es: ReadonlyArray<Escaneo>): number {
  const semanas = [...new Set(es.map((e) => semanaDe(e.at)))].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < semanas.length; i++) {
    run = i > 0 && semanas[i] - semanas[i - 1] === 7 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}
/** Consecutive weeks with a visit up to now; this week still counts as alive if last week had one. */
export function rachaActual(es: ReadonlyArray<Escaneo>, ahora: Date = new Date()): number {
  const semanas = new Set(es.map((e) => semanaDe(e.at)));
  let w = semanaDe(ahora);
  if (!semanas.has(w)) w -= 7;
  let n = 0;
  while (semanas.has(w)) {
    n++;
    w -= 7;
  }
  return n;
}

export interface Inicio {
  bebidas: number;
  esteMes: number;
  racha: number;
  favorito: { nombre: string; veces: number; pct: number } | null;
  ultimos: { nombre: string; cuando: string; valor: string; puntos: number }[];
}

/** The home screen: totals, the favourite and the last three scans. */
export function inicio(es: ReadonlyArray<Escaneo>, ahora: Date = new Date()): Inicio {
  const orden = [...es].sort((a, b) => b.at.localeCompare(a.at));
  const total = nBebidas(es);
  const fav = porBebida(es)[0];
  return {
    bebidas: total,
    esteMes: nBebidas(enPeriodo(es, desdeDe("mes", ahora))),
    racha: rachaActual(es, ahora),
    favorito: fav && total ? { nombre: fav.nombre, veces: fav.veces, pct: Math.round((fav.veces / total) * 100) } : null,
    ultimos: orden.slice(0, 3).map((e) => {
      const b = bebidas(e);
      const nombre = (b.length ? b : e.items).map((i) => (i.qty > 1 ? `${i.qty} × ${i.nombre}` : i.nombre)).join(" + ") || "Tu compra";
      return { nombre, cuando: `${diaCorto(e.at, ahora)} · ${hora(e.at)}`, valor: pesos(valorDe(e)), puntos: e.puntos };
    }),
  };
}

const FRANJAS: { label: string; desde: number; hasta: number }[] = [
  { label: "Mañana", desde: 0, hasta: 12 },
  { label: "Mediodía", desde: 12, hasta: 14 },
  { label: "Tarde", desde: 14, hasta: 18 },
  { label: "Noche", desde: 18, hasta: 24 },
];

export interface Logro { label: string; hecho: boolean }

export interface Insights {
  bebidas: number;
  puntos: number;
  gastado: number;
  distintas: number;
  top: { nombre: string; veces: number; pct: number }[];
  meses: { label: string; v: number; actual: boolean }[];
  mejorMes: { nombre: string; v: number } | null;
  horaPico: string | null;
  pctManana: number;
  franjas: { label: string; v: number }[];
  dias: { label: string; v: number }[];
  diaFavorito: string | null;
  calientes: number;
  frias: number;
  favCaliente: string | null;
  favFria: string | null;
  rachaMasLarga: number;
  primera: { nombre: string; fecha: string } | null;
  logros: Logro[];
}

/** "8 a 10 a. m.", "11 a. m. a 1 p. m." */
function franjaHoras(h: number): string {
  const f = (x: number) => `${x % 12 || 12}`;
  const s = (x: number) => (x % 24 < 12 ? "a. m." : "p. m.");
  const fin = h + 2;
  return s(h) === s(fin) ? `${f(h)} a ${f(fin)} ${s(fin)}` : `${f(h)} ${s(h)} a ${f(fin)} ${s(fin)}`;
}

/** The insights screen for a period; the month bars always show the last six months. */
export function insights(todos: ReadonlyArray<Escaneo>, periodo: PeriodoInsights, ahora: Date = new Date()): Insights {
  const es = enPeriodo(todos, desdeDe(periodo, ahora));
  const total = nBebidas(es);
  const lista = porBebida(es);
  const top = lista.slice(0, 5).map((d) => ({ ...d, pct: total ? Math.round((d.veces / total) * 100) : 0 }));
  const resto = lista.slice(5).reduce((n, d) => n + d.veces, 0);
  if (resto) top.push({ nombre: "Otras", veces: resto, pct: Math.round((resto / total) * 100) });

  const n = bogota(ahora);
  const meses = Array.from({ length: 6 }, (_, i) => {
    const k = n.y * 12 + n.m - 5 + i;
    const v = nBebidas(todos.filter((e) => {
      const b = bogota(e.at);
      return b.y * 12 + b.m === k;
    }));
    return { label: MES_CORTO[k % 12], v, actual: i === 5, k };
  });
  const top1 = meses.reduce<(typeof meses)[number] | null>((a, m) => (m.v > 0 && (!a || m.v > a.v) ? m : a), null);

  const porHora = new Array<number>(24).fill(0);
  const porDia = new Array<number>(7).fill(0);
  let calientes = 0;
  let frias = 0;
  const cal = new Map<string, number>();
  const fri = new Map<string, number>();
  for (const e of es) {
    const b = bogota(e.at);
    for (const i of bebidas(e)) {
      porHora[b.h] += i.qty;
      porDia[b.dow] += i.qty;
      if (i.tipo === "caliente") {
        calientes += i.qty;
        cal.set(i.nombre, (cal.get(i.nombre) ?? 0) + i.qty);
      } else {
        frias += i.qty;
        fri.set(i.nombre, (fri.get(i.nombre) ?? 0) + i.qty);
      }
    }
  }
  let pico = -1;
  let picoV = 0;
  for (let h = 0; h < 23; h++) {
    const v = porHora[h] + porHora[h + 1];
    if (v > picoV) {
      picoV = v;
      pico = h;
    }
  }
  const franjas = FRANJAS.map((f) => ({ label: f.label, v: porHora.slice(f.desde, f.hasta).reduce((a, b) => a + b, 0) }));
  const maxDia = Math.max(...porDia);
  const mayor = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const primera = [...todos].sort((a, b) => a.at.localeCompare(b.at)).find((e) => bebidas(e).length);

  const distintas = lista.length;
  const totalTodo = nBebidas(todos);
  const distintasTodo = porBebida(todos).length;
  const favTodo = porBebida(todos)[0];
  const mananaTodo = todos.reduce((k, e) => k + (bogota(e.at).h < 12 ? bebidas(e).reduce((x, i) => x + i.qty, 0) : 0), 0);
  const racha = rachaMasLarga(todos);

  // Badges look at the whole history, whatever the period: done ones, then the next goal of each ladder.
  const logros: Logro[] = [];
  if (totalTodo >= 5 && mananaTodo / totalTodo >= 0.5) logros.push({ label: "Del madrugón", hecho: true });
  if (favTodo && favTodo.veces >= 5 && favTodo.veces / totalTodo >= 0.3) logros.push({ label: `Fiel al ${favTodo.nombre}`, hecho: true });
  if (racha >= 4) logros.push({ label: `${racha} semanas seguidas`, hecho: true });
  const escalon = (metas: number[], valor: number, hecho: (m: number) => string, falta: (m: number) => string) => {
    const logradas = metas.filter((m) => valor >= m);
    if (logradas.length) logros.push({ label: hecho(logradas[logradas.length - 1]), hecho: true });
    const sig = metas.find((m) => valor < m);
    if (sig) logros.push({ label: falta(sig), hecho: false });
  };
  escalon([1, 10, 25, 50, 100, 250], totalTodo, (m) => (m === 1 ? "Primera bebida" : `${m} bebidas`), (m) => `${m} bebidas · faltan ${m - totalTodo}`);
  escalon([3, 6, 12, 20], distintasTodo, (m) => `Probaste ${m} distintas`, (m) => `Prueba ${m} bebidas distintas`);

  return {
    bebidas: total,
    puntos: es.reduce((k, e) => k + e.puntos, 0),
    gastado: es.reduce((k, e) => k + valorDe(e), 0),
    distintas,
    top,
    meses: meses.map(({ label, v, actual }) => ({ label, v, actual })),
    mejorMes: top1 ? { nombre: MESES[top1.k % 12], v: top1.v } : null,
    horaPico: pico >= 0 ? franjaHoras(pico) : null,
    pctManana: total ? Math.round((franjas[0].v / total) * 100) : 0,
    franjas,
    dias: porDia.map((v, i) => ({ label: "LMXJVSD"[i], v })),
    diaFavorito: maxDia > 0 ? DIAS[porDia.indexOf(maxDia)] : null,
    calientes,
    frias,
    favCaliente: mayor(cal),
    favFria: mayor(fri),
    rachaMasLarga: racha,
    primera: primera ? { nombre: bebidas(primera)[0].nombre, fecha: fechaLarga(primera.at, ahora) } : null,
    logros,
  };
}

/** One customer's total in a ranking period. */
export interface FilaRanking { clienteId: string; instagram: string; puntos: number; bebidas: number }
export interface PuestoRanking { pos: number; handle: string; puntos: number; bebidas: number; yo: boolean }

/** Most points first; ties go to more drinks, then the handle. Only who earned something. */
export function ordenarRanking(filas: ReadonlyArray<FilaRanking>): FilaRanking[] {
  return filas.filter((f) => f.puntos > 0).sort((a, b) => b.puntos - a.puntos || b.bebidas - a.bebidas || a.instagram.localeCompare(b.instagram));
}

/** Position of a customer (1-based), null when not ranked. */
export function puestoDe(filas: ReadonlyArray<FilaRanking>, clienteId: string | null): number | null {
  if (!clienteId) return null;
  const i = ordenarRanking(filas).findIndex((f) => f.clienteId === clienteId);
  return i < 0 ? null : i + 1;
}

export interface Ranking {
  podio: PuestoRanking[];
  filas: PuestoRanking[];
  yo: { pos: number; puntos: number; faltan: number | null } | null;
}

/**
 * The ranking screen: podium (top 3), the next rows (4–7, or 4–6 plus me when
 * I'm further down), and my own place. Others' handles are masked.
 */
export function ranking(filas: ReadonlyArray<FilaRanking>, yoId: string | null): Ranking {
  const orden = ordenarRanking(filas);
  const puesto = (f: FilaRanking, i: number): PuestoRanking => {
    const yo = f.clienteId === yoId;
    return { pos: i + 1, handle: yo ? `@${f.instagram}` : enmascarar(f.instagram), puntos: f.puntos, bebidas: f.bebidas, yo };
  };
  const todos = orden.map(puesto);
  const mio = todos.findIndex((p) => p.yo);
  let filasVista = todos.slice(3, 7);
  if (mio >= 7) filasVista = [...todos.slice(3, 6), todos[mio]];
  return {
    podio: todos.slice(0, 3),
    filas: filasVista,
    yo: mio < 0 ? null : { pos: mio + 1, puntos: todos[mio].puntos, faltan: mio > 0 ? todos[mio - 1].puntos - todos[mio].puntos + 1 : null },
  };
}

/** What a scan just registered, for the «¡Listo!» screen after the cup's QR. */
export interface Registro {
  /** Name on the cup ("Valen"), else null. */
  nombre: string | null;
  instagram: string;
  bebida: string;
  /** "$7.000" */
  valor: string;
  puntos: number;
  total: number;
  /** Monthly ranking place before and after this scan (null = not ranked). */
  puestoAntes: number | null;
  puesto: number | null;
  /** How many of this drink the customer has had, this one included. */
  veces: number;
  esFavorito: boolean;
  /** "8:42 a. m." */
  hora: string;
}

