"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTurnoContext } from "@/lib/turno/server";
import { recomputeProductosForIngrediente } from "@/lib/db/recetas";

const Schema = z.object({
  id: z.string().uuid(),
  tandas: z.coerce.number().positive().max(50),
});

export type TandaResult = { ok: true } | { ok: false; error: string };

/**
 * A batch made on the tablet, signed by the person logged in: the SQL
 * function takes its ingredients out, puts the yield in and re-prices the
 * preparación in one transaction; then the products that use it follow.
 */
export async function registrarTanda(input: unknown): Promise<TandaResult> {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revisa cuántas tandas hiciste." };
  const d = parsed.data;
  if (Math.round(d.tandas * 2) !== d.tandas * 2) return { ok: false, error: "Las tandas van enteras o en medias (1, 1,5, 2…)." };
  let ctx;
  try {
    ctx = await requireTurnoContext();
  } catch {
    return { ok: false, error: "Sin acceso. Inicia sesión otra vez en el tablet." };
  }
  const { admin, organizationId: orgId } = ctx;
  const { error } = await admin.rpc("registrar_tanda", {
    p_org: orgId,
    p_prep: d.id,
    p_tandas: d.tandas,
    p_by: ctx.actor.profileId,
    p_restaurant: ctx.restaurantId,
    p_note: null,
  });
  if (error) {
    console.error("[registrarTanda]", error);
    const msg = String(error.message ?? "");
    if (msg.includes("no tiene ingredientes")) return { ok: false, error: "Esta preparación no tiene receta todavía. Avisa al dueño." };
    if (msg.includes("no es una preparación")) return { ok: false, error: "Esa preparación ya no existe." };
    return { ok: false, error: "No se pudo guardar. Intenta de nuevo." };
  }
  await recomputeProductosForIngrediente(admin, orgId, d.id).catch((e) => console.error("[registrarTanda] recompute:", e));
  revalidatePath("/turno/inventario", "layout");
  revalidatePath("/inventario", "layout");
  return { ok: true };
}
