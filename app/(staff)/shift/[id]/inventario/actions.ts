"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireShiftToolContext } from "@/lib/shift/staff";
import { registrarEstados } from "@/lib/inventario/faltantes-db";
import type { RapidoResult } from "@/components/inventario/rapido-screen";

const Schema = z.object({
  shiftInstanceId: z.string().uuid(),
  items: z
    .array(z.object({ ingredienteId: z.string().uuid(), estado: z.enum(["ok", "bajo", "agotado"]), note: z.string().trim().max(120).optional() }))
    .min(1)
    .max(300),
});

/** Record the taps from a person's own shift screen; access is their RLS view of the instance. */
export async function reportarFaltantesShift(input: unknown): Promise<RapidoResult> {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Reporte inválido." };
  let ctx;
  try {
    ctx = await requireShiftToolContext(parsed.data.shiftInstanceId);
  } catch {
    return { ok: false, error: "Sin acceso a este turno." };
  }
  const res = await registrarEstados(
    ctx.admin,
    { orgId: ctx.organizationId, restaurantId: ctx.restaurantId, shiftInstanceId: ctx.instance.id, profileId: ctx.actor.profileId },
    parsed.data.items,
  );
  if (res.ok) {
    revalidatePath(`/shift/${ctx.instance.id}`);
    revalidatePath(`/shift/${ctx.instance.id}/inventario`);
    revalidatePath("/turno/inventario");
    revalidatePath("/inventario/faltantes");
    revalidatePath("/notificaciones");
    revalidatePath(`/hoy/${ctx.instance.date}`);
  }
  return res;
}
