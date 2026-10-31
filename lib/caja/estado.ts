import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CajaCierre } from "@/lib/types";
import { inicioDia } from "@/lib/inventario/mermas-db";
import { localToUtc, ventanaTurno, type ResumenPagos } from "./arqueo";
import { baseSugerida, getCierreByInstance, listCierresSede, listInstancesForCaja, sumPagosVentana, type BaseSugerida, type CajaInstance } from "./cierres";
import { comprasPorPagar, listMovimientos, type CajaMovimiento, type CompraPorPagar } from "./movimientos-db";
import { elegirTurnoCaja } from "./turno";

/** Everything the Caja screen on the tablet needs, loaded at once (lib/caja/estado.ts). */
export interface CajaEstado {
  today: string;
  /** Today's turnos of the sede (the arqueo picks one) and the live or rejected cierre of each. */
  instances: CajaInstance[];
  existing: Record<string, CajaCierre>;
  /** The turno whose drawer the screen is about: the open one still to be counted, else the last one. */
  instanceId: string | null;
  /** When that turno is scheduled to end (ISO), for «falta 1 h para cerrar». */
  finAt: string | null;
  /** Sales window of that turno so far (open = until now). */
  ventana: { desde: string; hasta: string } | null;
  /** POS payments inside the window (cash is what the drawer should hold). */
  pagos: ResumenPagos;
  /** What the previous close left (and how it was found). */
  base: BaseSugerida;
  /** The base the drawer opened with: what the next turno found when it didn't match, else what was left. */
  baseInicial: number;
  /** The previous close's base, still to be validated by whoever opens. */
  porValidar: CajaCierre | null;
  /** Today's movements of the sede, newest first (voided ones included). */
  movimientos: CajaMovimiento[];
  porPagar: CompraPorPagar[];
  historial: CajaCierre[];
}


type Scope = { orgId: string; restaurantId: string; tz: string; today: string };

/** The fields of CajaEstado that depend on which turno it is about. */
type Centro = Pick<CajaEstado, "instanceId" | "finAt" | "ventana" | "pagos" | "porValidar">;

async function centrar(db: SupabaseClient, scope: Scope, instances: CajaInstance[], base: BaseSugerida, instanceId: string | null): Promise<Centro> {
  const { orgId, restaurantId, tz, today } = scope;
  const inst = instances.find((i) => i.id === instanceId) ?? null;
  const ventana = inst ? ventanaTurno({ date: today, inicio: inst.inicio, tz, opened_at: inst.opened_at, closed_at: inst.closed_at }) : null;
  const pagos = ventana ? await sumPagosVentana(db, { orgId, restaurantId, desde: ventana.desde, hasta: ventana.hasta }) : { efectivo: 0, tarjeta: 0, transferencia: 0, count: 0 };
  const prev = base.cierre;
  return {
    instanceId,
    finAt: inst ? localToUtc(today, inst.fin.slice(0, 5), tz).toISOString() : null,
    ventana,
    pagos,
    porValidar: prev && !prev.base_validada_at && prev.shift_instance_id !== instanceId ? prev : null,
  };
}

/**
 * Everything the Caja screen needs. `instanceId` centres it on that turno
 * (the one the person is on); without it, elegirTurnoCaja's guess.
 */
export async function loadCajaEstado(db: SupabaseClient, scope: Scope & { instanceId?: string | null }): Promise<CajaEstado> {
  const { orgId, restaurantId, today } = scope;
  const [instances, base, historial, movimientos, porPagar] = await Promise.all([
    listInstancesForCaja(db, restaurantId, today),
    baseSugerida(db, restaurantId),
    listCierresSede(db, restaurantId, 10),
    listMovimientos(db, { orgId, restaurantId }, inicioDia(today), 200),
    comprasPorPagar(db, orgId),
  ]);
  const existing: Record<string, CajaCierre> = {};
  await Promise.all(
    instances.map(async (i) => {
      const c = await getCierreByInstance(db, orgId, i.id);
      if (c) existing[i.id] = c;
    }),
  );
  const centro = await centrar(db, scope, instances, base, elegirTurnoCaja(instances, existing, scope.instanceId));
  const prev = base.cierre;
  const baseInicial = prev && prev.base_validada_ok === false && prev.base_encontrada_cop != null ? prev.base_encontrada_cop : base.monto;
  return { today, instances, existing, ...centro, base, baseInicial, movimientos, porPagar, historial };
}

/**
 * An already-loaded state re-centred on `instanceId`, so a page can load the
 * caja in parallel with the turno board and focus it once it knows the
 * person's turno. Same window, payments and pending base as loadCajaEstado.
 */
export async function recentrarCaja(db: SupabaseClient, scope: Scope, estado: CajaEstado, instanceId: string | null): Promise<CajaEstado> {
  if (!instanceId || estado.instanceId === instanceId || !estado.instances.some((i) => i.id === instanceId)) return estado;
  return { ...estado, ...(await centrar(db, scope, estado.instances, estado.base, instanceId)) };
}
