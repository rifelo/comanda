"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";

// Result shapes (documented — `"use server"` files cannot export type-only
// declarations):
//   inviteMember  → { ok: true; id: string } | { error: string; pending?: true }
//   updateMember  → { ok: true } | { error: string }
//   removeMember  → { ok: true } | { error: string }
//   toggleActive  → { ok: true } | { error: string }

const InviteSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(160),
  phone: z.string().max(60).optional(),
});

const UpdateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120).optional(),
  phone: z.string().max(60).nullable().optional(),
  active: z.boolean().optional(),
});

/**
 * Invite a person to the sede's roster.
 *
 * Creating an auth user from a server action requires the service-role
 * client (admin API) and an invite email flow we haven't wired yet. Until
 * then this returns `pending: true` so the UI can show "pendiente de
 * activar". When we wire the admin invite, we'll create the auth user with
 * `organization_id` metadata and let the existing `handle_new_user` trigger
 * provision the profile, then INSERT into `restaurant_members`.
 *
 * TODO: wire createUser via SUPABASE_SERVICE_ROLE_KEY + send invite email.
 */
export async function inviteMember(input: z.infer<typeof InviteSchema>) {
  const parsed = InviteSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos inválidos." };

  const sede = await getActiveSede();
  if (!sede) return { error: "Sin sede activa." };

  await requireAdmin();
  void parsed.data;
  // Surface the gap explicitly so the UI can render a "Pendiente" stamp
  // until the admin invite flow lands.
  return {
    error:
      "Invitar persona aún no está conectado al backend (pendiente del flujo de invitación por email).",
    pending: true,
  };
}

export async function updateMember(input: z.infer<typeof UpdateSchema>) {
  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos inválidos." };

  const sede = await getActiveSede();
  if (!sede) return { error: "Sin sede activa." };

  const { supabase } = await requireAdmin();

  // The "name" lives on `profiles` (shared across orgs); phone + active
  // belong on `restaurant_members` (per-sede). Update both when present.
  if (parsed.data.name) {
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: parsed.data.name.trim() })
      .eq("id", parsed.data.id);
    if (error) return { error: error.message };
  }
  if (parsed.data.phone !== undefined || parsed.data.active !== undefined) {
    const patch: Record<string, unknown> = {};
    if (parsed.data.phone !== undefined) patch.phone = parsed.data.phone;
    if (parsed.data.active !== undefined) patch.active = parsed.data.active;
    const { error } = await supabase
      .from("restaurant_members")
      .update(patch)
      .eq("user_id", parsed.data.id)
      .eq("restaurant_id", sede.id);
    if (error) return { error: error.message };
  }

  revalidatePath("/configuracion/equipo");
  revalidatePath("/turnos/asignacion");
  return { ok: true };
}

export async function removeMember(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) {
    return { error: "Datos inválidos." };
  }

  const sede = await getActiveSede();
  if (!sede) return { error: "Sin sede activa." };

  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("restaurant_members")
    .delete()
    .eq("user_id", id)
    .eq("restaurant_id", sede.id);
  if (error) return { error: error.message };

  revalidatePath("/configuracion/equipo");
  revalidatePath("/turnos/asignacion");
  return { ok: true };
}

export async function toggleActive(input: { id: string; active: boolean }) {
  return updateMember({ id: input.id, active: input.active });
}
