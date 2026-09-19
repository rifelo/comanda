"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { makeInitials } from "@/lib/db/roster";
import type { RosterMember } from "@/lib/types";

// Result shapes (documented — `"use server"` files cannot export type-only
// declarations):
//   inviteMember             → { ok: true; member: RosterMember } | { error: string }
//   createMemberWithPassword → { ok: true; member: RosterMember } | { error: string }
//   setMemberPassword        → { ok: true } | { error: string }
//   updateMember             → { ok: true } | { error: string }
//   removeMember             → { ok: true } | { error: string }
//   toggleActive             → { ok: true } | { error: string }

const InviteSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(160),
  phone: z.string().max(60).optional(),
});

const PasswordSchema = z.string().min(8, "La contraseña debe tener al menos 8 caracteres.").max(72);
const CreateWithPasswordSchema = InviteSchema.extend({ password: PasswordSchema });
const SetPasswordSchema = z.object({ id: z.string().uuid(), password: PasswordSchema });

const UpdateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120).optional(),
  phone: z.string().max(60).nullable().optional(),
  active: z.boolean().optional(),
});

/**
 * Invite a person to the sede's roster as a staff member.
 *
 * Sends a Supabase invite email (service-role admin API) seeded with the
 * `organization_id` + `role: 'staff'` metadata the `handle_new_user` trigger
 * reads to provision the profile in the right org. Once the auth user exists
 * (the trigger runs synchronously), we add the per-sede `restaurant_members`
 * row so the person shows in the roster and sees their shifts in `/today`.
 *
 * The invitee accepts via the email link, which lands them on `/auth/callback`
 * with an active session. (They sign in afterwards with Google or by setting a
 * password through "olvidé mi contraseña".)
 */
export async function inviteMember(input: z.infer<typeof InviteSchema>) {
  const parsed = InviteSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos inválidos." };

  const { profile } = await requireAdmin();
  const sede = await getActiveSede();
  if (!sede) return { error: "Sin sede activa." };

  const { name, email, phone } = parsed.data;
  const admin = createSupabaseAdminClient();

  // Where Supabase sends the invitee after they accept. Falls back to the
  // project's configured Site URL when we can't derive the origin.
  const h = await headers();
  const origin =
    h.get("origin") ?? (h.get("host") ? `https://${h.get("host")}` : null);
  const redirectTo = origin ? `${origin}/auth/callback` : undefined;

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: {
      role: "staff",
      organization_id: profile.organization_id,
      full_name: name,
    },
    redirectTo,
  });

  if (error || !data?.user) {
    const already = /already.*(registered|exist)|been registered/i.test(
      error?.message ?? "",
    );
    return {
      error: already
        ? "Ya existe una cuenta con ese correo."
        : (error?.message ?? "No se pudo enviar la invitación."),
    };
  }

  // The trigger created the staff profile in our org; link it to this sede.
  const { error: memErr } = await admin
    .from("restaurant_members")
    .upsert(
      {
        user_id: data.user.id,
        restaurant_id: sede.id,
        phone: phone ?? null,
        active: true,
      },
      { onConflict: "user_id,restaurant_id" },
    );
  if (memErr) return { error: memErr.message };

  revalidatePath("/configuracion/equipo");
  revalidatePath("/turnos/asignacion");

  const member: RosterMember = {
    id: data.user.id,
    initials: makeInitials(name),
    name,
    email,
    phone: phone ?? null,
    active: true,
    role: "staff",
    isMember: true,
  };
  return { ok: true as const, member };
}

/**
 * Create a staff account with a password the admin hands over in person —
 * the way the shared shift tablet signs people in (email + password, no
 * invite email, no Google needed). `email_confirm: true` skips the
 * confirmation mail; the `handle_new_user` trigger reads the metadata and
 * provisions the profile in this org. If the email already has an account
 * (e.g. they signed in with Google before), we adopt it: set the password
 * and, when the profile has no org yet, attach it to ours.
 */
export async function createMemberWithPassword(
  input: z.infer<typeof CreateWithPasswordSchema>,
) {
  const parsed = CreateWithPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const { profile } = await requireAdmin();
  const sede = await getActiveSede();
  if (!sede) return { error: "Sin sede activa." };

  const { name, email, phone, password } = parsed.data;
  const admin = createSupabaseAdminClient();
  const orgId = profile.organization_id;

  let userId: string | null = null;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: "staff", organization_id: orgId, full_name: name },
  });

  if (!createErr && created?.user) {
    userId = created.user.id;
  } else if (/already.*(registered|exist)|been registered/i.test(createErr?.message ?? "")) {
    const existing = await findAuthUserByEmail(email);
    if (!existing) return { error: "Ya existe una cuenta con ese correo." };
    const { data: prof } = await admin
      .from("profiles")
      .select("id, organization_id")
      .eq("id", existing)
      .maybeSingle<{ id: string; organization_id: string | null }>();
    if (prof?.organization_id && prof.organization_id !== orgId) {
      return { error: "Ese correo ya pertenece a otra organización." };
    }
    const { error: pwErr } = await admin.auth.admin.updateUserById(existing, { password });
    if (pwErr) return { error: pwErr.message };
    if (prof && !prof.organization_id) {
      await admin.from("profiles").update({ organization_id: orgId, role: "staff", full_name: name }).eq("id", existing);
      await admin
        .from("organization_members")
        .upsert({ user_id: existing, organization_id: orgId, role: "staff" }, { onConflict: "user_id,organization_id" });
    }
    userId = existing;
  } else {
    return { error: createErr?.message ?? "No se pudo crear la cuenta." };
  }

  const { error: memErr } = await admin
    .from("restaurant_members")
    .upsert(
      { user_id: userId, restaurant_id: sede.id, phone: phone ?? null, active: true },
      { onConflict: "user_id,restaurant_id" },
    );
  if (memErr) return { error: memErr.message };

  revalidatePath("/configuracion/equipo");
  revalidatePath("/turnos/asignacion");

  const member: RosterMember = {
    id: userId,
    initials: makeInitials(name),
    name,
    email,
    phone: phone ?? null,
    active: true,
    role: "staff",
    isMember: true,
  };
  return { ok: true as const, member };
}

/** Reset a team member's password (admin hands the new one over in person). */
export async function setMemberPassword(input: z.infer<typeof SetPasswordSchema>) {
  const parsed = SetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const { profile, supabase } = await requireAdmin();
  // Only people in the admin's org (the RLS "profiles read own org" scopes this read).
  const { data: target } = await supabase
    .from("profiles")
    .select("id, organization_id")
    .eq("id", parsed.data.id)
    .maybeSingle<{ id: string; organization_id: string | null }>();
  if (!target || target.organization_id !== profile.organization_id) {
    return { error: "Esa persona no está en tu organización." };
  }
  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.updateUserById(parsed.data.id, { password: parsed.data.password });
  if (error) return { error: error.message };
  return { ok: true as const };
}

/** auth.users isn't queryable through PostgREST; page through the admin API. */
async function findAuthUserByEmail(email: string): Promise<string | null> {
  const admin = createSupabaseAdminClient();
  const wanted = email.toLowerCase();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data) return null;
    const hit = data.users.find((u) => u.email?.toLowerCase() === wanted);
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  return null;
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
