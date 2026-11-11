"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { validarNiveles } from "@/lib/inventario/niveles";

const qty = z.number().finite().min(0).max(9_999_999);
const NivelesSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        stock_critico: qty,
        stock_min: qty,
        stock_objetivo: qty.nullable(),
        ubicacion: z.string().trim().max(40).nullable(),
        pack_label: z.string().trim().max(24).nullable(),
        pieza_qty: z.number().finite().positive().max(9_999_999).nullable(),
        proveedor_id: z.string().uuid().nullable(),
        conteo_diario: z.boolean(),
        controla_vencimiento: z.boolean(),
      }),
    )
    .min(1)
    .max(500),
});

function revalidate() {
  for (const p of ["/inventario", "/inventario/niveles", "/inventario/proveedores", "/notificaciones", "/turno/conteo"]) revalidatePath(p);
  revalidatePath("/turno/inventario", "layout");
}

/**
 * Save the levels table: the rows the owner touched, all at once. A row whose
 * levels contradict each other is refused by name so nothing half-saves.
 */
export async function guardarNiveles(input: unknown): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const parsed = NivelesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Hay un valor que no es válido." };
  const { profile, supabase } = await requireAdmin();
  const orgId = profile.organization_id;

  const ids = parsed.data.items.map((i) => i.id);
  const { data: rows } = await supabase.from("ingredientes").select("id, name").eq("organization_id", orgId).in("id", ids);
  const nameOf = new Map((rows ?? []).map((r) => [r.id as string, r.name as string]));
  for (const it of parsed.data.items) {
    if (!nameOf.has(it.id)) return { ok: false, error: "Un ítem ya no existe. Recarga la página." };
    const bad = validarNiveles(it.stock_critico, it.stock_min, it.stock_objetivo || null);
    if (bad) return { ok: false, error: `${nameOf.get(it.id)}: ${bad}` };
  }

  const results = await Promise.all(
    parsed.data.items.map(({ id, ...v }) =>
      supabase
        .from("ingredientes")
        .update({ ...v, stock_objetivo: v.stock_objetivo || null, ubicacion: v.ubicacion || null, pack_label: v.pack_label || null })
        .eq("organization_id", orgId)
        .eq("id", id),
    ),
  );
  const failed = results.filter((r) => r.error).length;
  revalidate();
  if (failed) return { ok: false, error: `No se pudieron guardar ${failed} de ${results.length} ítems. Intenta de nuevo.` };
  return { ok: true, count: results.length };
}
