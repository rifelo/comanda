"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";

const revalidate = () => revalidatePath("/combos");

const CreateSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio.").max(120),
  description: z.string().trim().max(300).optional(),
  price_cop: z.coerce.number().int().min(0).max(100_000_000),
  items: z
    .array(
      z.object({
        producto_id: z.string().uuid(),
        qty: z.coerce.number().int().positive().max(100),
      }),
    )
    .min(1, "Agrega al menos un producto."),
});

export async function createCombo(input: unknown) {
  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const { name, description, price_cop, items } = parsed.data;
  const { profile, supabase } = await requireAdmin();
  const orgId = profile.organization_id;

  const { data: combo, error } = await supabase
    .from("combos")
    .insert({ organization_id: orgId, name, description: description || null, price_cop })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { error: "Ya existe un combo con ese nombre." };
    return { error: error.message };
  }

  const byProd = new Map<string, number>();
  for (const it of items) byProd.set(it.producto_id, it.qty);
  const rows = [...byProd.entries()].map(([producto_id, qty], position) => ({
    organization_id: orgId,
    combo_id: combo.id,
    producto_id,
    qty,
    position,
  }));
  const { error: itemsErr } = await supabase.from("combo_items").insert(rows);
  if (itemsErr) return { error: itemsErr.message };

  revalidate();
  return { ok: true };
}

const IdSchema = z.object({ combo_id: z.string().uuid() });

export async function deleteCombo(input: unknown) {
  const parsed = IdSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos inválidos." };
  const { profile, supabase } = await requireAdmin();
  const { error } = await supabase
    .from("combos")
    .delete()
    .eq("id", parsed.data.combo_id)
    .eq("organization_id", profile.organization_id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

const ToggleSchema = z.object({
  combo_id: z.string().uuid(),
  active: z.boolean(),
});

export async function setComboActive(input: unknown) {
  const parsed = ToggleSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos inválidos." };
  const { profile, supabase } = await requireAdmin();
  const { error } = await supabase
    .from("combos")
    .update({ active: parsed.data.active })
    .eq("id", parsed.data.combo_id)
    .eq("organization_id", profile.organization_id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

const PriceSchema = z.object({
  combo_id: z.string().uuid(),
  price_cop: z.coerce.number().int().min(0).max(100_000_000),
});

export async function updateComboPrice(input: unknown) {
  const parsed = PriceSchema.safeParse(input);
  if (!parsed.success) return { error: "Precio inválido." };
  const { profile, supabase } = await requireAdmin();
  const { error } = await supabase
    .from("combos")
    .update({ price_cop: parsed.data.price_cop })
    .eq("id", parsed.data.combo_id)
    .eq("organization_id", profile.organization_id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}
