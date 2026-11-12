"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { recomputeProductosForIngrediente } from "@/lib/db/recetas";
import { errorPreparacion } from "@/lib/inventario/preparaciones";
import { recostearPreparacion } from "@/lib/inventario/preparaciones-db";

const Schema = z.object({
  id: z.string().uuid(),
  /** null = it stops being a preparación. */
  rinde: z.coerce.number().positive().max(1_000_000).nullable(),
  lineas: z.array(z.object({ ingredienteId: z.string().uuid(), qty: z.coerce.number().positive().max(1_000_000) })).max(30),
});

export type PrepResult = { ok: true; costo: number | null } | { ok: false; error: string };

/**
 * The owner sets what one batch of a house preparación takes and yields.
 * Lines are replaced as a whole; the preparación is re-priced from its
 * ingredients and the products that use it follow.
 */
export async function guardarPreparacion(input: unknown): Promise<PrepResult> {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revisa las cantidades." };
  const d = parsed.data;
  const { profile, supabase } = await requireAdmin();
  const orgId = profile.organization_id;

  const { data: item } = await supabase.from("ingredientes").select("id").eq("organization_id", orgId).eq("id", d.id).maybeSingle();
  if (!item) return { ok: false, error: "Ese insumo ya no existe." };

  if (d.rinde == null) {
    await supabase.from("preparacion_items").delete().eq("organization_id", orgId).eq("preparacion_id", d.id);
    const { error } = await supabase.from("ingredientes").update({ rinde: null }).eq("organization_id", orgId).eq("id", d.id);
    if (error) return { ok: false, error: "No se pudo guardar." };
    revalidatePath(`/inventario/${d.id}`);
    return { ok: true, costo: null };
  }

  const { data: otras } = await supabase.from("ingredientes").select("id").eq("organization_id", orgId).not("rinde", "is", null).neq("id", d.id);
  const invalid = errorPreparacion({ id: d.id, rinde: d.rinde, lineas: d.lineas, preparaciones: new Set((otras ?? []).map((o) => o.id as string)) });
  if (invalid) return { ok: false, error: invalid };
  const { count } = await supabase
    .from("ingredientes")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .in("id", d.lineas.map((l) => l.ingredienteId));
  if ((count ?? 0) !== d.lineas.length) return { ok: false, error: "Un ingrediente ya no existe. Recarga la página." };

  // Replace the lines: delete then insert (a failed insert leaves it empty, and the tablet then refuses the batch).
  await supabase.from("preparacion_items").delete().eq("organization_id", orgId).eq("preparacion_id", d.id);
  const { error: insErr } = await supabase.from("preparacion_items").insert(
    d.lineas.map((l, i) => ({ organization_id: orgId, preparacion_id: d.id, ingrediente_id: l.ingredienteId, qty: l.qty, position: i })),
  );
  if (insErr) {
    console.error("[guardarPreparacion] items:", insErr);
    return { ok: false, error: "No se pudieron guardar los ingredientes. Intenta de nuevo." };
  }
  const { error: upErr } = await supabase.from("ingredientes").update({ rinde: d.rinde }).eq("organization_id", orgId).eq("id", d.id);
  if (upErr) return { ok: false, error: "No se pudo guardar el rendimiento." };
  const costo = await recostearPreparacion(supabase, orgId, d.id);
  await recomputeProductosForIngrediente(supabase, orgId, d.id);
  revalidatePath(`/inventario/${d.id}`);
  revalidatePath("/productos", "layout");
  return { ok: true, costo };
}
