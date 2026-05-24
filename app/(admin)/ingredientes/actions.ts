"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";

// Units the UI exposes; DB column is plain text so adding a new unit is
// just a Zod change here + the option list in the drawer.
const UNITS = ["kg", "g", "L", "ml", "und", "porción", "loncha", "bola"] as const;

const CreateCategoriaSchema = z.object({
  label: z.string().trim().min(1).max(120),
  parentId: z.string().uuid().nullable(),
});

const CreateIngredienteSchema = z.object({
  name: z.string().trim().min(1).max(160),
  categoryId: z.string().uuid().nullable(),
  unit: z.enum(UNITS),
  stockCurrent: z.coerce.number().min(0),
  stockMin: z.coerce.number().min(0),
  mermaPct: z.coerce.number().min(0).max(100).default(0),
  costCop: z.coerce.number().int().min(0),
});

const UpdateIngredienteSchema = CreateIngredienteSchema.extend({
  id: z.string().uuid(),
});

const DeleteIngredienteSchema = z.object({
  id: z.string().uuid(),
});

// Result shapes documented for callers; never exported as types from a
// "use server" file (Next 16 RSC payload gotcha — see
// app/(admin)/restaurants/new/actions.ts).

export async function createIngredienteCategoria(input: unknown) {
  const parsed = CreateCategoriaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Datos inválidos." };
  }
  const { profile, supabase } = await requireAdmin();

  const { data, error } = await supabase
    .from("ingrediente_categorias")
    .insert({
      organization_id: profile.organization_id,
      parent_id: parsed.data.parentId,
      label: parsed.data.label,
    })
    .select("id, organization_id, parent_id, label, position")
    .single();

  if (error) {
    console.error("[createIngredienteCategoria]", error);
    if (error.code === "23505") {
      return {
        ok: false as const,
        error: "Ya existe una categoría con ese nombre en este nivel.",
      };
    }
    return { ok: false as const, error: error.message };
  }

  revalidatePath("/productos/ingredientes");
  return { ok: true as const, categoria: data };
}

export async function createIngrediente(input: unknown) {
  const parsed = CreateIngredienteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Datos inválidos." };
  }
  const { profile, supabase } = await requireAdmin();

  const d = parsed.data;
  const { data, error } = await supabase
    .from("ingredientes")
    .insert({
      organization_id: profile.organization_id,
      category_id: d.categoryId,
      name: d.name,
      unit: d.unit,
      stock_current: d.stockCurrent,
      stock_min: d.stockMin,
      merma_pct: d.mermaPct,
      cost_cop: d.costCop,
    })
    .select(
      "id, organization_id, category_id, name, unit, stock_current, stock_min, merma_pct, cost_cop, archived",
    )
    .single();

  if (error) {
    console.error("[createIngrediente]", error);
    if (error.code === "23505") {
      return {
        ok: false as const,
        error: "Ya existe un ingrediente con ese nombre.",
      };
    }
    return { ok: false as const, error: error.message };
  }

  revalidatePath("/productos/ingredientes");
  return { ok: true as const, ingrediente: data };
}

export async function updateIngrediente(input: unknown) {
  const parsed = UpdateIngredienteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Datos inválidos." };
  }
  const { profile, supabase } = await requireAdmin();

  const d = parsed.data;
  const { data, error } = await supabase
    .from("ingredientes")
    .update({
      category_id: d.categoryId,
      name: d.name,
      unit: d.unit,
      stock_current: d.stockCurrent,
      stock_min: d.stockMin,
      merma_pct: d.mermaPct,
      cost_cop: d.costCop,
    })
    .eq("id", d.id)
    .eq("organization_id", profile.organization_id)
    .select(
      "id, organization_id, category_id, name, unit, stock_current, stock_min, merma_pct, cost_cop, archived",
    )
    .single();

  if (error) {
    console.error("[updateIngrediente]", error);
    if (error.code === "23505") {
      return {
        ok: false as const,
        error: "Ya existe un ingrediente con ese nombre.",
      };
    }
    return { ok: false as const, error: error.message };
  }

  revalidatePath("/productos/ingredientes");
  return { ok: true as const, ingrediente: data };
}

export async function deleteIngrediente(input: unknown) {
  const parsed = DeleteIngredienteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Datos inválidos." };
  }
  const { profile, supabase } = await requireAdmin();

  const { error } = await supabase
    .from("ingredientes")
    .delete()
    .eq("id", parsed.data.id)
    .eq("organization_id", profile.organization_id);

  if (error) {
    console.error("[deleteIngrediente]", error);
    return { ok: false as const, error: error.message };
  }

  revalidatePath("/productos/ingredientes");
  return { ok: true as const };
}
