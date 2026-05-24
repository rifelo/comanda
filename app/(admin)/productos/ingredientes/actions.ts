"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";

// Free-text on the DB side; Zod constrains to the set the UI exposes.
const UNITS = ["kg", "g", "L", "ml", "und", "porción", "loncha", "bola"] as const;

const CreateCategorySchema = z.object({
  restaurantId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  parentId: z.string().uuid().nullable(),
});

const CreateIngredientSchema = z.object({
  restaurantId: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  categoryId: z.string().uuid().nullable(),
  unit: z.enum(UNITS),
  stockCurrent: z.coerce.number().min(0),
  stockMin: z.coerce.number().min(0),
  mermaPct: z.coerce.number().min(0).max(100).default(0),
  costPerUnit: z.coerce.number().min(0),
});

// Result shapes documented for callers; not exported as types from a
// "use server" file (see app/(admin)/restaurants/new/actions.ts for the
// Next 16 RSC payload gotcha).
//   type CreateCategoryResult = { ok: true; category: {...} } | { ok: false; error: string }
//   type CreateIngredientResult = { ok: true; ingredient: {...} } | { ok: false; error: string }

async function assertOwnsRestaurant(restaurantId: string) {
  const ctx = await requireAdmin();
  const { data } = await ctx.supabase
    .from("restaurants")
    .select("id")
    .eq("id", restaurantId)
    .eq("organization_id", ctx.profile.organization_id)
    .maybeSingle();
  if (!data) {
    return { ok: false as const, error: "Sede no encontrada." };
  }
  return { ok: true as const, ctx };
}

export async function createIngredientCategory(input: unknown) {
  const parsed = CreateCategorySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Datos inválidos." };
  }
  const guard = await assertOwnsRestaurant(parsed.data.restaurantId);
  if (!guard.ok) return guard;

  const { data, error } = await guard.ctx.supabase
    .from("ingredient_categories")
    .insert({
      restaurant_id: parsed.data.restaurantId,
      parent_id: parsed.data.parentId,
      name: parsed.data.name,
    })
    .select("id, restaurant_id, parent_id, name, depth, sort_index")
    .single();

  if (error) {
    console.error("[createIngredientCategory]", error);
    if (error.code === "23505") {
      return {
        ok: false as const,
        error: "Ya existe una categoría con ese nombre en este nivel.",
      };
    }
    return { ok: false as const, error: error.message };
  }

  revalidatePath("/productos/ingredientes");
  return { ok: true as const, category: data };
}

export async function createIngredient(input: unknown) {
  const parsed = CreateIngredientSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Datos inválidos." };
  }
  const guard = await assertOwnsRestaurant(parsed.data.restaurantId);
  if (!guard.ok) return guard;

  const d = parsed.data;
  const { data, error } = await guard.ctx.supabase
    .from("ingredients")
    .insert({
      restaurant_id: d.restaurantId,
      category_id: d.categoryId,
      name: d.name,
      unit: d.unit,
      stock_current: d.stockCurrent,
      stock_min: d.stockMin,
      merma_pct: d.mermaPct,
      cost_per_unit: d.costPerUnit,
    })
    .select(
      "id, restaurant_id, category_id, parent_ingredient_id, name, unit, stock_current, stock_min, merma_pct, cost_per_unit, archived",
    )
    .single();

  if (error) {
    console.error("[createIngredient]", error);
    if (error.code === "23505") {
      return {
        ok: false as const,
        error: "Ya existe un ingrediente con ese nombre.",
      };
    }
    return { ok: false as const, error: error.message };
  }

  revalidatePath("/productos/ingredientes");
  return { ok: true as const, ingredient: data };
}
