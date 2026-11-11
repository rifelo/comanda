import "server-only";
import type { TurnoContext } from "@/lib/turno/server";
import { planificarDia } from "@/lib/inventario/agente/db";

/**
 * Plans today's verification tasks the first time a tablet opens Inventario
 * (the nightly cron usually did it already; planificarDia is idempotent per
 * org and day). Never blocks the page: a failure is logged and the tablet
 * shows whatever tasks exist.
 */
export async function planificarHoy(ctx: TurnoContext, fecha: string): Promise<void> {
  try {
    await planificarDia(ctx.admin, ctx.organizationId, { fecha, restaurantId: ctx.restaurantId });
  } catch (e) {
    console.error("[agente] planificarDia desde el tablet", e);
  }
}
