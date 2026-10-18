"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTurnoContext } from "@/lib/turno/server";
import { ZONAS } from "@/lib/inventario/niveles";
import { errorSugerencia, yaSugerida } from "@/lib/inventario/sugerencias";

const Schema = z.object({
  zona: z.enum(ZONAS),
  tipo: z.enum(["ubicacion", "nuevo"]),
  ingredienteId: z.string().uuid().optional(),
  nombre: z.string().trim().max(80).optional(),
  presentacion: z.string().trim().max(30).optional(),
  nota: z.string().trim().max(200).optional(),
});

/**
 * A suggestion from the tablet, signed by whoever is logged in: an item of
 * the list belongs in this section, or something here is missing from the
 * list. Nothing changes until the owner applies it from the panel. The same
 * open suggestion twice is answered as already noted.
 */
export async function sugerirItem(input: unknown): Promise<{ ok: true; repetida: boolean } | { ok: false; error: string }> {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revisa la sugerencia." };
  const d = parsed.data;
  const invalid = errorSugerencia(d);
  if (invalid) return { ok: false, error: invalid };
  let ctx;
  try {
    ctx = await requireTurnoContext();
  } catch {
    return { ok: false, error: "Sin acceso. Inicia sesión otra vez en el tablet." };
  }
  const { admin, organizationId: orgId } = ctx;
  if (d.tipo === "ubicacion") {
    const { data: ing } = await admin.from("ingredientes").select("id, ubicacion").eq("organization_id", orgId).eq("id", d.ingredienteId!).eq("archived", false).maybeSingle();
    if (!ing) return { ok: false, error: "Ese ítem ya no está en el inventario." };
    if (ing.ubicacion === d.zona) return { ok: false, error: `Ya está en ${d.zona}.` };
  }
  const { data: abiertas } = await admin.from("inventario_sugerencias").select("zona, tipo, ingrediente_id, nombre").eq("organization_id", orgId).eq("status", "pendiente");
  if (yaSugerida(d, abiertas ?? [])) return { ok: true, repetida: true };
  const { error } = await admin.from("inventario_sugerencias").insert({
    organization_id: orgId,
    restaurant_id: ctx.restaurantId,
    zona: d.zona,
    tipo: d.tipo,
    ingrediente_id: d.tipo === "ubicacion" ? d.ingredienteId : null,
    nombre: d.tipo === "nuevo" ? d.nombre : null,
    presentacion: d.tipo === "nuevo" ? d.presentacion || null : null,
    nota: d.nota || null,
    sugerido_por: ctx.actor.profileId,
  });
  if (error) {
    console.error("[sugerirItem]", error);
    return { ok: false, error: "No se pudo guardar. Intenta de nuevo." };
  }
  revalidatePath("/turno/inventario", "layout");
  revalidatePath("/inventario", "layout");
  return { ok: true, repetida: false };
}
