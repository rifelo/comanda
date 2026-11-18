import "server-only";
import type { TurnoContext } from "@/lib/turno/server";
import { planificarDia, resultadosDelDia, tareasPendientes } from "@/lib/inventario/agente/db";

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

export interface ConteoApertura {
  pendientes: number;
  hechas: number;
  /** The first few items still to count, for the opening step. */
  nombres: string[];
}

/**
 * The inventory count owed before opening: today's verification tasks
 * still pending (planned first, so the list exists at 6 a.m. even if the
 * nightly cron failed) and how many were already answered today.
 */
export async function conteoApertura(ctx: TurnoContext, fecha: string): Promise<ConteoApertura> {
  await planificarHoy(ctx, fecha);
  const [pend, hechas] = await Promise.all([tareasPendientes(ctx.admin, ctx.organizationId, fecha), resultadosDelDia(ctx.admin, ctx.organizationId, fecha)]);
  return { pendientes: pend.length, hechas: hechas.length, nombres: pend.slice(0, 6).map((t) => t.name) };
}

/** `?volver=` only ever points back into the opening flow (no open redirects). */
export function volverSeguro(v: string | undefined): string | null {
  return v && /^\/turno\/abrir(\?|$)/.test(v) ? v : null;
}
