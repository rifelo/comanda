"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";

const revalidate = () => revalidatePath("/modificadores");

const CreateGroupSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio.").max(120),
  type: z.enum(["single", "multiple"]),
  required: z.boolean().optional(),
});

export async function createGroup(input: unknown) {
  const parsed = CreateGroupSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const { profile, supabase } = await requireAdmin();
  const { error } = await supabase.from("modifier_groups").insert({
    organization_id: profile.organization_id,
    name: parsed.data.name,
    type: parsed.data.type,
    required: parsed.data.required ?? false,
  });
  if (error) {
    if (error.code === "23505") return { error: "Ya existe un grupo con ese nombre." };
    return { error: error.message };
  }
  revalidate();
  return { ok: true };
}

const GroupIdSchema = z.object({ group_id: z.string().uuid() });

export async function deleteGroup(input: unknown) {
  const parsed = GroupIdSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos inválidos." };
  const { profile, supabase } = await requireAdmin();
  const { error } = await supabase
    .from("modifier_groups")
    .delete()
    .eq("id", parsed.data.group_id)
    .eq("organization_id", profile.organization_id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

const UpdateGroupSchema = z.object({
  group_id: z.string().uuid(),
  required: z.boolean(),
});

export async function setGroupRequired(input: unknown) {
  const parsed = UpdateGroupSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos inválidos." };
  const { profile, supabase } = await requireAdmin();
  const { error } = await supabase
    .from("modifier_groups")
    .update({ required: parsed.data.required })
    .eq("id", parsed.data.group_id)
    .eq("organization_id", profile.organization_id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

const AddOptionSchema = z.object({
  group_id: z.string().uuid(),
  name: z.string().trim().min(1, "El nombre es obligatorio.").max(120),
  price_delta_cop: z.coerce.number().int().min(-10_000_000).max(10_000_000),
});

export async function addOption(input: unknown) {
  const parsed = AddOptionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const { profile, supabase } = await requireAdmin();
  const { error } = await supabase.from("modifier_options").insert({
    organization_id: profile.organization_id,
    group_id: parsed.data.group_id,
    name: parsed.data.name,
    price_delta_cop: parsed.data.price_delta_cop,
  });
  if (error) {
    if (error.code === "23505") return { error: "Esa opción ya existe en el grupo." };
    return { error: error.message };
  }
  revalidate();
  return { ok: true };
}

const ToggleOptionSchema = z.object({
  option_id: z.string().uuid(),
  available: z.boolean(),
});

export async function setOptionAvailable(input: unknown) {
  const parsed = ToggleOptionSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos inválidos." };
  const { profile, supabase } = await requireAdmin();
  const { error } = await supabase
    .from("modifier_options")
    .update({ available: parsed.data.available })
    .eq("id", parsed.data.option_id)
    .eq("organization_id", profile.organization_id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

const OptionIdSchema = z.object({ option_id: z.string().uuid() });

export async function removeOption(input: unknown) {
  const parsed = OptionIdSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos inválidos." };
  const { profile, supabase } = await requireAdmin();
  const { error } = await supabase
    .from("modifier_options")
    .delete()
    .eq("id", parsed.data.option_id)
    .eq("organization_id", profile.organization_id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}
