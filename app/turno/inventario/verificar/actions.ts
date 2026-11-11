"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTurnoContext } from "@/lib/turno/server";
import { responderTarea } from "@/lib/inventario/agente/db";

const Schema = z.object({
  tareaId: z.string().uuid(),
  /** Stock units (pieces already multiplied out); null = «No lo encuentro». */
  counted: z.number().finite().min(0).max(10_000_000).nullable(),
});

export type ResponderResult =
  | { ok: true; estado: "aplicado" | "revisar" | "no_encontrado" }
  /** `yaHecha`: someone else answered it (or it is gone) — the tablet just moves on. */
  | { ok: false; error: string; yaHecha?: boolean };

/**
 * The barista's answer to one verification task, signed by the person
 * logged in on the tablet. Blind: nothing about the system's stock comes
 * back, only whether it was saved.
 */
export async function responder(input: unknown): Promise<ResponderResult> {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revisa la cantidad." };
  let ctx;
  try {
    ctx = await requireTurnoContext();
  } catch {
    return { ok: false, error: "Sin acceso. Inicia sesión otra vez en el tablet." };
  }
  try {
    const res = await responderTarea(ctx.admin, ctx.organizationId, {
      tareaId: parsed.data.tareaId,
      counted: parsed.data.counted,
      actorId: ctx.actor.profileId,
      restaurantId: ctx.restaurantId,
    });
    if (!res.ok) return { ok: false, error: res.error, yaHecha: res.yaHecha === true };
    revalidatePath("/turno/inventario");
    return { ok: true, estado: res.estado };
  } catch (e) {
    console.error("[agente] responder", e);
    return { ok: false, error: "No se pudo guardar. Intenta de nuevo." };
  }
}
