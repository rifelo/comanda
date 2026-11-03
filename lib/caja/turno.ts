import type { CajaCierre } from "@/lib/types";
import type { CajaInstance } from "./cierres";

/** Under this, a turno is a task slot, not a shift at the register. */
export const TURNO_CAJA_MIN_HORAS = 2;
const minutos = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};
/** «06:30»–«07:30» → short. Unknown times count as a real turno. */
export function esTurnoCorto(i: { inicio?: string; fin?: string }): boolean {
  if (!i.inicio || !i.fin) return false;
  let d = minutos(i.fin) - minutos(i.inicio);
  if (d <= 0) d += 24 * 60;
  return d < TURNO_CAJA_MIN_HORAS * 60;
}

/**
 * The turno whose drawer the Caja screen is about (pure).
 *  · `preferId` — the turno the person is on, chosen by the team app with
 *    lib/turno/hoy `turnoActual` — wins when it is one of today's;
 *  · else the open turno that started latest and has no live cierre;
 *  · else the latest one without a live cierre; else the last one.
 * Without `preferId` a task-only turno («Limpieza semanal máquina») or the
 * overlapping Noche can win, which is why the team app always passes it.
 */
export function elegirTurnoCaja(
  todas: readonly (Pick<CajaInstance, "id" | "status"> & Partial<Pick<CajaInstance, "inicio" | "fin">>)[],
  existing: Record<string, Pick<CajaCierre, "status">>,
  preferId?: string | null,
): string | null {
  // A short task turno («Sacar la basura · camión», 1 h) never holds the
  // drawer while a real one exists today: its arqueo would compare the wrong hours.
  const largos = todas.filter((i) => !esTurnoCorto(i));
  const instances = largos.length ? largos : todas;
  if (preferId && instances.some((i) => i.id === preferId)) return preferId;
  const libre = (i: { id: string }) => !existing[i.id] || existing[i.id].status === "rechazado";
  const open = instances.filter((i) => i.status === "open" && libre(i));
  const pool = open.length ? open : instances.filter(libre);
  return pool.length ? pool[pool.length - 1].id : (instances[instances.length - 1]?.id ?? null);
}
