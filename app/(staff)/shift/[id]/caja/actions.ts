"use server";

import { revalidatePath } from "next/cache";
import { requireShiftToolContext } from "@/lib/shift/staff";
import { z } from "zod";
import { CierreInputSchema, confirmarBase, crearCierre, validarBase, type BaseActionResult, type EnviarCierreResult } from "@/lib/caja/cierres";

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

const ConfirmarSchema = z.object({ shiftInstanceId: z.string().uuid(), cierreId: z.string().uuid() });
const ValidarSchema = z.object({
  shiftInstanceId: z.string().uuid(),
  cierreId: z.string().uuid(),
  ok: z.boolean(),
  encontrado: z.number().int().min(0).max(50_000_000).optional(),
  nota: z.string().trim().max(300).optional(),
});

function afterBase(shiftId: string) {
  revalidatePath(`/shift/${shiftId}`);
  revalidatePath(`/shift/${shiftId}/caja`);
  revalidatePath("/turno/caja");
  revalidatePath("/caja");
}

/** Whoever closed confirms the planned base is set aside; `shiftInstanceId` scopes the access check. */
export async function confirmarBaseShift(input: unknown): Promise<BaseActionResult> {
  const parsed = ConfirmarSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Cierre inválido." };
  let ctx;
  try {
    ctx = await requireShiftToolContext(parsed.data.shiftInstanceId);
  } catch {
    return { ok: false, error: "Sin acceso a este turno." };
  }
  const r = await confirmarBase(ctx.admin, { restaurantId: ctx.restaurantId, by: ctx.actor.profileId }, parsed.data.cierreId);
  if (r.ok) afterBase(ctx.instance.id);
  return r;
}

/** Whoever opens this turno records whether the previous base was found as planned. */
export async function validarBaseShift(input: unknown): Promise<BaseActionResult> {
  const parsed = ValidarSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validación inválida." };
  let ctx;
  try {
    ctx = await requireShiftToolContext(parsed.data.shiftInstanceId);
  } catch {
    return { ok: false, error: "Sin acceso a este turno." };
  }
  const { shiftInstanceId: _s, ...rest } = parsed.data; // eslint-disable-line @typescript-eslint/no-unused-vars
  const r = await validarBase(ctx.admin, { restaurantId: ctx.restaurantId, by: ctx.actor.profileId }, rest);
  if (r.ok) afterBase(ctx.instance.id);
  return r;
}
