"use server";

import { revalidatePath } from "next/cache";
import { requireTurnoContext } from "@/lib/turno/server";
import { z } from "zod";
import { CierreInputSchema, confirmarBase, crearCierre, validarBase, type BaseActionResult, type EnviarCierreResult } from "@/lib/caja/cierres";

/**
 * Store the cash count from the shared tablet, signed by the person logged
 * in on it. The device cookie authorises the sede; the count itself is
 * `crearCierre` (shared with the staff shift screen).
 */
export async function enviarCierreCaja(input: unknown): Promise<EnviarCierreResult> {
  const parsed = CierreInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Cierre inválido." };
  let ctx;
  try {
    ctx = await requireTurnoContext();
  } catch {
    return { ok: false, error: "Sin acceso. Inicia sesión otra vez en el tablet." };
  }
  const res = await crearCierre(
    ctx.admin,
    { orgId: ctx.organizationId, restaurantId: ctx.restaurantId, tz: ctx.sede.tz, countedBy: ctx.actor.profileId },
    parsed.data,
  );
  if (res.ok) {
    revalidatePath("/turno/caja");
    revalidatePath("/turno");
    revalidatePath("/caja");
    revalidatePath(`/hoy/${res.shiftDate}`);
  }
  return res;
}

const ConfirmarSchema = z.object({ cierreId: z.string().uuid() });
const ValidarSchema = z.object({
  cierreId: z.string().uuid(),
  ok: z.boolean(),
  encontrado: z.number().int().min(0).max(50_000_000).optional(),
  nota: z.string().trim().max(300).optional(),
});

function afterBase() {
  revalidatePath("/turno/caja");
  revalidatePath("/turno");
  revalidatePath("/caja");
}

/** Whoever closed confirms the planned base is set aside in the drawer. */
export async function confirmarBaseCaja(input: unknown): Promise<BaseActionResult> {
  const parsed = ConfirmarSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Cierre inválido." };
  let ctx;
  try {
    ctx = await requireTurnoContext();
  } catch {
    return { ok: false, error: "Sin acceso. Inicia sesión otra vez en el tablet." };
  }
  const r = await confirmarBase(ctx.admin, { restaurantId: ctx.restaurantId, by: ctx.actor.profileId }, parsed.data.cierreId);
  if (r.ok) afterBase();
  return r;
}

/** Whoever opens the next turno records whether the base was found as planned. */
export async function validarBaseCaja(input: unknown): Promise<BaseActionResult> {
  const parsed = ValidarSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validación inválida." };
  let ctx;
  try {
    ctx = await requireTurnoContext();
  } catch {
    return { ok: false, error: "Sin acceso. Inicia sesión otra vez en el tablet." };
  }
  const r = await validarBase(ctx.admin, { restaurantId: ctx.restaurantId, by: ctx.actor.profileId }, parsed.data);
  if (r.ok) afterBase();
  return r;
}
