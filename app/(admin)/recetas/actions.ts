"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { recomputeProductoCost } from "@/lib/db/recetas";

function revalidate() {
  // Recipe edits roll up into producto.cost_cop / margin_pct, so the catálogo
  // needs to refresh too.
  revalidatePath("/recetas");
  revalidatePath("/catalogo");
}

const AddItemSchema = z.object({
  producto_id: z.string().uuid(),
  ingrediente_id: z.string().uuid(),
  qty: z.coerce.number().positive().max(1_000_000),
});

/** Add a single ingrediente line to a producto's recipe. */
export async function addRecetaItem(input: unknown) {
  const parsed = AddItemSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos inválidos." };
  const { producto_id, ingrediente_id, qty } = parsed.data;
  const { profile, supabase } = await requireAdmin();
  const orgId = profile.organization_id;

  // Snapshot the unit from the ingrediente (cost is computed from cost_cop).
  const { data: ing } = await supabase
    .from("ingredientes")
    .select("unit")
    .eq("id", ingrediente_id)
    .eq("organization_id", orgId)
    .single();
  if (!ing) return { error: "Ingrediente no encontrado." };

  const { error } = await supabase.from("receta_items").insert({
    organization_id: orgId,
    producto_id,
    ingrediente_id,
    qty,
    unit: ing.unit,
  });
  if (error) {
    if (error.code === "23505")
      return { error: "Ese ingrediente ya está en la receta." };
    return { error: error.message };
  }

  await recomputeProductoCost(supabase, orgId, producto_id);
  revalidate();
  return { ok: true };
}

const UpdateQtySchema = z.object({
  item_id: z.string().uuid(),
  qty: z.coerce.number().positive().max(1_000_000),
});

/** Change the quantity of a recipe line. */
export async function updateRecetaItemQty(input: unknown) {
  const parsed = UpdateQtySchema.safeParse(input);
  if (!parsed.success) return { error: "Cantidad inválida." };
  const { item_id, qty } = parsed.data;
  const { profile, supabase } = await requireAdmin();
  const orgId = profile.organization_id;

  const { data: updated, error } = await supabase
    .from("receta_items")
    .update({ qty })
    .eq("id", item_id)
    .eq("organization_id", orgId)
    .select("producto_id")
    .single();
  if (error) return { error: error.message };
  if (!updated) return { error: "Línea no encontrada." };

  await recomputeProductoCost(supabase, orgId, updated.producto_id);
  revalidate();
  return { ok: true };
}

const RemoveItemSchema = z.object({ item_id: z.string().uuid() });

/** Remove a recipe line. */
export async function removeRecetaItem(input: unknown) {
  const parsed = RemoveItemSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos inválidos." };
  const { profile, supabase } = await requireAdmin();
  const orgId = profile.organization_id;

  const { data: removed, error } = await supabase
    .from("receta_items")
    .delete()
    .eq("id", parsed.data.item_id)
    .eq("organization_id", orgId)
    .select("producto_id")
    .single();
  if (error) return { error: error.message };
  if (!removed) return { error: "Línea no encontrada." };

  await recomputeProductoCost(supabase, orgId, removed.producto_id);
  revalidate();
  return { ok: true };
}

const CreateRecetaSchema = z.object({
  producto_id: z.string().uuid(),
  items: z
    .array(
      z.object({
        ingrediente_id: z.string().uuid(),
        qty: z.coerce.number().positive().max(1_000_000),
      }),
    )
    .min(1, "Agrega al menos un ingrediente."),
});

/** Create a recipe for a producto from a list of ingrediente lines. */
export async function createReceta(input: unknown) {
  const parsed = CreateRecetaSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const { producto_id, items } = parsed.data;
  const { profile, supabase } = await requireAdmin();
  const orgId = profile.organization_id;

  // De-dup ingredientes within the submission (last qty wins).
  const byIng = new Map<string, number>();
  for (const it of items) byIng.set(it.ingrediente_id, it.qty);

  const ids = [...byIng.keys()];
  const { data: ings } = await supabase
    .from("ingredientes")
    .select("id, unit")
    .eq("organization_id", orgId)
    .in("id", ids);
  const unitById = new Map((ings ?? []).map((i) => [i.id, i.unit]));
  if (unitById.size !== ids.length)
    return { error: "Algún ingrediente no existe." };

  const rows = [...byIng.entries()].map(([ingrediente_id, qty], position) => ({
    organization_id: orgId,
    producto_id,
    ingrediente_id,
    qty,
    unit: unitById.get(ingrediente_id)!,
    position,
  }));

  const { error } = await supabase.from("receta_items").insert(rows);
  if (error) {
    if (error.code === "23505")
      return { error: "Este producto ya tiene receta." };
    return { error: error.message };
  }

  await recomputeProductoCost(supabase, orgId, producto_id);
  revalidate();
  return { ok: true };
}
