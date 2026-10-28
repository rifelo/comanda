import { posMoney } from "@/lib/pos/types";
import type { DetalleMovimiento, MotivoCaja, TipoMovimiento } from "@/lib/caja/movimientos";
import type { CajaMovimiento } from "@/lib/caja/movimientos-db";

/**
 * A movement typed on the tablet and not yet confirmed by the server: it
 * waits in localStorage (also without internet) and is resent until it
 * lands; `clientRef` makes the retry idempotent. A photo that couldn't be
 * uploaded travels as a shrunk data URL and is uploaded first.
 */
export interface MovPendiente {
  clientRef: string;
  tipo: TipoMovimiento;
  monto: number;
  motivo: MotivoCaja;
  justificacion: string;
  detalle: DetalleMovimiento;
  compraId: string | null;
  compraLabel: string | null;
  compraConFactura: boolean;
  fotoPath: string | null;
  fotoData: string | null;
  at: string;
  by: string;
  /** The server refused it for good (not a network failure): shown, not resent. */
  error?: string;
}

/** One row of «Movimientos de hoy», from the server or from the queue. */
export interface MovVista {
  key: string;
  id: string | null;
  tipo: TipoMovimiento;
  monto: number;
  motivo: MotivoCaja;
  justificacion: string;
  detalle: DetalleMovimiento;
  tieneFoto: boolean;
  compraLabel: string | null;
  compraConFactura: boolean;
  at: string;
  by: string | null;
  anuladoAt: string | null;
  anuladoBy: string | null;
  anuladoMotivo: string | null;
  /** Still in the tablet's queue. */
  espera: boolean;
  error?: string;
  /** The queued photo, to preview it in the detail. */
  fotoData?: string | null;
}

export const COLA_KEY = "caja:cola";

export function leerCola(): MovPendiente[] {
  try {
    const raw = window.localStorage.getItem(COLA_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v) ? (v as MovPendiente[]) : [];
  } catch {
    return [];
  }
}

export function guardarCola(cola: MovPendiente[]): void {
  try {
    if (cola.length) window.localStorage.setItem(COLA_KEY, JSON.stringify(cola));
    else window.localStorage.removeItem(COLA_KEY);
  } catch {
    // Full or private storage: try again without the photos, the queue still holds the movements.
    try {
      window.localStorage.setItem(COLA_KEY, JSON.stringify(cola.map((c) => ({ ...c, fotoData: null }))));
    } catch {
      /* the queue lives in memory only */
    }
  }
}

export function compraLabel(folio: number | null, proveedor: string | null): string | null {
  if (folio == null) return null;
  return `Pedido n.º ${folio}${proveedor ? ` · ${proveedor}` : ""}`;
}

export function vistaServidor(m: CajaMovimiento): MovVista {
  return {
    key: m.id,
    id: m.id,
    tipo: m.tipo,
    monto: m.monto,
    motivo: m.motivo,
    justificacion: m.justificacion,
    detalle: m.detalle,
    tieneFoto: !!m.fotoPath,
    compraLabel: compraLabel(m.compraFolio, m.compraProveedor),
    compraConFactura: m.compraConFactura,
    at: m.createdAt,
    by: m.by,
    anuladoAt: m.anuladoAt,
    anuladoBy: m.anuladoBy,
    anuladoMotivo: m.anuladoMotivo,
    espera: false,
  };
}

export function vistaCola(p: MovPendiente): MovVista {
  return {
    key: p.clientRef,
    id: null,
    tipo: p.tipo,
    monto: p.monto,
    motivo: p.motivo,
    justificacion: p.justificacion,
    detalle: p.detalle,
    tieneFoto: !!(p.fotoPath || p.fotoData),
    compraLabel: p.compraLabel,
    compraConFactura: p.compraConFactura,
    at: p.at,
    by: p.by,
    anuladoAt: null,
    anuladoBy: null,
    anuladoMotivo: null,
    espera: true,
    error: p.error,
    fotoData: p.fotoData,
  };
}

/** Server rows plus what is still queued (and not yet back from the server), newest first. */
export function unirMovimientos(server: CajaMovimiento[], cola: MovPendiente[]): MovVista[] {
  const llegaron = new Set(server.map((m) => m.clientRef).filter(Boolean));
  return [...cola.filter((p) => !llegaron.has(p.clientRef)).map(vistaCola), ...server.map(vistaServidor)].sort((a, b) => b.at.localeCompare(a.at));
}

/** Ingresos and salidas inside the turno window (voided left out) — what moves the expected cash. */
export function sumaVentana(rows: ReadonlyArray<MovVista>, desde: string | null): { ingresos: number; salidas: number; nIngresos: number; nSalidas: number } {
  const out = { ingresos: 0, salidas: 0, nIngresos: 0, nSalidas: 0 };
  const t0 = desde ? Date.parse(desde) : 0;
  for (const r of rows) {
    if (r.anuladoAt || Date.parse(r.at) < t0) continue;
    if (r.tipo === "ingreso") {
      out.ingresos += r.monto;
      out.nIngresos += 1;
    } else {
      out.salidas += r.monto;
      out.nSalidas += 1;
    }
  }
  return out;
}

export const plata = (n: number) => posMoney(n).replace(/^\$\s?/, "$ ");
export const plataSigno = (n: number) => (n < 0 ? `− ${plata(-n)}` : plata(n));

/** «9:40» — numeric parts only, so the server render and the browser agree. */
export function hora(iso: string, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${h}:${m}`;
}

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «Mié 28 oct 2026» for a YYYY-MM-DD wall-clock day. */
export function fechaLarga(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DIAS[dow]} ${d} ${MESES[m - 1]} ${y}`;
}

/** «1 h 18 min» / «25 min» until `iso` (null when it already passed). */
export function faltaPara(iso: string, now: number): string | null {
  const min = Math.round((Date.parse(iso) - now) / 60_000);
  if (min <= 0) return null;
  const h = Math.floor(min / 60);
  return h ? `${h} h ${min % 60} min` : `${min} min`;
}

export function iniciales(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "·";
}

export function nuevoRef(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // Older WebViews: RFC 4122 v4 from Math.random.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
