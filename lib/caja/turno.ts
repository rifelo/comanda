import type { CajaCierre } from "@/lib/types";
import type { CajaInstance } from "./cierres";

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
  instances: readonly Pick<CajaInstance, "id" | "status">[],
  existing: Record<string, Pick<CajaCierre, "status">>,
  preferId?: string | null,
): string | null {
  if (preferId && instances.some((i) => i.id === preferId)) return preferId;
  const libre = (i: { id: string }) => !existing[i.id] || existing[i.id].status === "rechazado";
  const open = instances.filter((i) => i.status === "open" && libre(i));
  const pool = open.length ? open : instances.filter(libre);
  return pool.length ? pool[pool.length - 1].id : (instances[instances.length - 1]?.id ?? null);
}
