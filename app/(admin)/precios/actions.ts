"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";

const revalidate = () => revalidatePath("/precios");

const CreateListSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio.").max(120),
  description: z.string().trim().max(200).optional(),
});

export async function createPriceList(input: unknown) {
  const parsed = CreateListSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const { profile, supabase } = await requireAdmin();
  const { error } = await supabase.from("price_lists").insert({
    organization_id: profile.organization_id,
    name: parsed.data.name,
    description: parsed.data.description || null,
  });
  if (error) {
    if (error.code === "23505") return { error: "Ya existe una lista con ese nombre." };
    return { error: error.message };
  }
  revalidate();
  return { ok: true };
}

const ListIdSchema = z.object({ price_list_id: z.string().uuid() });

export async function deletePriceList(input: unknown) {
  const parsed = ListIdSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos inválidos." };
  const { profile, supabase } = await requireAdmin();
  const { error } = await supabase
    .from("price_lists")
    .delete()
    .eq("id", parsed.data.price_list_id)
    .eq("organization_id", profile.organization_id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

const SetPriceSchema = z.object({
  price_list_id: z.string().uuid(),
  producto_id: z.string().uuid(),
  price_cop: z.coerce.number().int().min(0).max(100_000_000),
});

/** Set (upsert) a producto's price in a list. */
export async function setListPrice(input: unknown) {
  const parsed = SetPriceSchema.safeParse(input);
  if (!parsed.success) return { error: "Precio inválido." };
  const { profile, supabase } = await requireAdmin();
  const { error } = await supabase.from("price_list_items").upsert(
    {
      organization_id: profile.organization_id,
      price_list_id: parsed.data.price_list_id,
      producto_id: parsed.data.producto_id,
      price_cop: parsed.data.price_cop,
    },
    { onConflict: "price_list_id,producto_id" },
  );
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

const ClearPriceSchema = z.object({
  price_list_id: z.string().uuid(),
  producto_id: z.string().uuid(),
});

/** Remove a producto's override in a list — it falls back to the base price. */
export async function clearListPrice(input: unknown) {
  const parsed = ClearPriceSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos inválidos." };
  const { profile, supabase } = await requireAdmin();
  const { error } = await supabase
    .from("price_list_items")
    .delete()
    .eq("price_list_id", parsed.data.price_list_id)
    .eq("producto_id", parsed.data.producto_id)
    .eq("organization_id", profile.organization_id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}
