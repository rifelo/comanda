import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CajaCierre } from "@/lib/types";
import { inicioDia } from "@/lib/inventario/mermas-db";
import { localToUtc, ventanaTurno, type ResumenPagos } from "./arqueo";
import { baseSugerida, getCierreByInstance, listCierresSede, listInstancesForCaja, sumPagosVentana, type BaseSugerida, type CajaInstance } from "./cierres";
import { comprasPorPagar, listMovimientos, type CajaMovimiento, type CompraPorPagar } from "./movimientos-db";

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

/** Pick the turno most likely being closed: the open one that started latest and has no live cierre. */
function turnoActual(instances: CajaInstance[], existing: Record<string, CajaCierre>): string | null {
  const libre = (i: CajaInstance) => !existing[i.id] || existing[i.id].status === "rechazado";
  const open = instances.filter((i) => i.status === "open" && libre(i));
  const pool = open.length ? open : instances.filter(libre);
  return pool.length ? pool[pool.length - 1].id : instances[instances.length - 1]?.id ?? null;
}

export async function loadCajaEstado(db: SupabaseClient, scope: { orgId: string; restaurantId: string; tz: string; today: string }): Promise<CajaEstado> {
  const { orgId, restaurantId, tz, today } = scope;
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
  const instanceId = turnoActual(instances, existing);
  const inst = instances.find((i) => i.id === instanceId) ?? null;
  const ventana = inst ? ventanaTurno({ date: today, inicio: inst.inicio, tz, opened_at: inst.opened_at, closed_at: inst.closed_at }) : null;
  const pagos = ventana ? await sumPagosVentana(db, { orgId, restaurantId, desde: ventana.desde, hasta: ventana.hasta }) : { efectivo: 0, tarjeta: 0, transferencia: 0, count: 0 };
  const prev = base.cierre;
  const porValidar = prev && !prev.base_validada_at && prev.shift_instance_id !== instanceId ? prev : null;
  const baseInicial = prev && prev.base_validada_ok === false && prev.base_encontrada_cop != null ? prev.base_encontrada_cop : base.monto;
  return {
    today,
    instances,
    existing,
    instanceId,
    finAt: inst ? localToUtc(today, inst.fin.slice(0, 5), tz).toISOString() : null,
    ventana,
    pagos,
    base,
    baseInicial,
    porValidar,
    movimientos,
    porPagar,
    historial,
  };
}
