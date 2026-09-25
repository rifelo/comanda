"use server";

import { revalidatePath } from "next/cache";
import { requireShiftToolContext } from "@/lib/shift/staff";
import { CierreInputSchema, crearCierre, type EnviarCierreResult } from "@/lib/caja/cierres";

/**
 * Store the cash count from the person's own shift screen. Access is the
 * person's RLS session (they can see the instance); the count is
 * `crearCierre`, shared with the tablet.
 */
export async function enviarCierreCajaShift(input: unknown): Promise<EnviarCierreResult> {
  const parsed = CierreInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Cierre inválido." };
  let ctx;
  try {
    ctx = await requireShiftToolContext(parsed.data.shiftInstanceId);
  } catch {
    return { ok: false, error: "Sin acceso a este turno." };
  }
  const res = await crearCierre(
    ctx.admin,
    { orgId: ctx.organizationId, restaurantId: ctx.restaurantId, tz: ctx.sede.tz, countedBy: ctx.actor.profileId },
    parsed.data,
  );
  if (res.ok) {
    revalidatePath(`/shift/${ctx.instance.id}`);
    revalidatePath(`/shift/${ctx.instance.id}/caja`);
    revalidatePath("/turno/caja");
    revalidatePath("/caja");
    revalidatePath(`/hoy/${res.shiftDate}`);
  }
  return res;
}
