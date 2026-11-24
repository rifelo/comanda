"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { errorNuevaPreparacion } from "@/lib/inventario/preparaciones";

const Schema = z.object({
  nombre: z.string().trim().max(120),
  unidad: z.string(),
  rinde: z.coerce.number().max(1_000_000),
});

export type CrearPreparacionResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * A new house preparación (cold foam de matcha, jarabe simple…): an insumo of
 * the inventory with what one batch yields. Its ingredients are set on the
 * insumo's page, where the owner lands next.
 */
export async function crearPreparacion(input: unknown): Promise<CrearPreparacionResult> {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revisa los datos." };
  const d = parsed.data;
  const invalid = errorNuevaPreparacion({ nombre: d.nombre, unidad: d.unidad, rinde: d.rinde });
  if (invalid) return { ok: false, error: invalid };
  const { profile, supabase } = await requireAdmin();
  const orgId = profile.organization_id;

  // Same shelf and category as the other preparaciones, when there are some.
  const { data: otra } = await supabase
    .from("ingredientes")
    .select("category_id, ubicacion")
    .eq("organization_id", orgId)
    .not("rinde", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("ingredientes")
    .insert({
      organization_id: orgId,
      name: d.nombre.trim(),
      unit: d.unidad,
      rinde: d.rinde,
      cost_cop: 0,
      stock_current: 0,
      category_id: (otra?.category_id as string | null) ?? null,
      ubicacion: (otra?.ubicacion as string | null) ?? null,
    })
    .select("id")
    .single();
  if (error || !data) {
    if (error?.code === "23505") return { ok: false, error: "Ya hay un insumo con ese nombre." };
    console.error("[crearPreparacion]", error);
    return { ok: false, error: "No se pudo crear. Intenta de nuevo." };
  }
  revalidatePath("/preparaciones");
  revalidatePath("/inventario");
  return { ok: true, id: data.id as string };
}
