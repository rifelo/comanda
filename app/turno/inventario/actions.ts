"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTurnoContext } from "@/lib/turno/server";
import { registrarEstados } from "@/lib/inventario/faltantes-db";
import { todayInTz } from "@/lib/utils";
import type { RapidoResult } from "@/components/inventario/rapido-screen";

export const RapidoInputSchema = z.object({
  items: z
    .array(z.object({ ingredienteId: z.string().uuid(), estado: z.enum(["ok", "bajo", "agotado"]), note: z.string().trim().max(120).optional() }))
    .min(1)
    .max(300),
});

/** Record the taps from the shared tablet, signed by the person logged in on it. */
export async function reportarFaltantes(input: unknown): Promise<RapidoResult> {
  const parsed = RapidoInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Reporte inválido." };
  let ctx;
  try {
    ctx = await requireTurnoContext();
  } catch {
    return { ok: false, error: "Sin acceso. Inicia sesión otra vez en el tablet." };
  }
  // Hang the report off today's open turno, if any.
  const today = todayInTz(ctx.sede.tz);
  const { data: inst } = await ctx.admin
    .from("shift_instances")
    .select("id")
    .eq("restaurant_id", ctx.restaurantId)
    .eq("date", today)
    .eq("status", "open")
    .limit(1)
    .maybeSingle();
  const res = await registrarEstados(
    ctx.admin,
    { orgId: ctx.organizationId, restaurantId: ctx.restaurantId, shiftInstanceId: (inst?.id as string | undefined) ?? null, profileId: ctx.actor.profileId },
    parsed.data.items,
  );
  if (res.ok) {
    revalidatePath("/turno/inventario");
    revalidatePath("/inventario/faltantes");
    revalidatePath("/notificaciones");
    revalidatePath(`/hoy/${today}`);
  }
  return res;
}
