"use server";

import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Result shape (documented only; `"use server"` files can only export
// async functions in Next 16):
//   { ok: boolean; userId?: string; reused?: boolean; error?: string }

const Schema = z.object({
  restaurant_id: z.string().uuid(),
  full_name: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(72).optional().or(z.literal("")),
});

/**
 * Add a staff member to a restaurant.
 *
 * Behavior:
 *   - If the email is new → create a Supabase Auth user with metadata
 *     `{role: 'staff', organization_id, full_name}`. The DB trigger
 *     `handle_new_user` will create the matching profile row.
 *   - If the email already belongs to a profile in the admin's org →
 *     skip user creation and just assign them to the restaurant.
 *   - Always (re)inserts `restaurant_members(user_id, restaurant_id)`,
 *     ignoring duplicates.
 *
 * Errors out cleanly if the email exists in a *different* org — we can't
 * leak that user across org boundaries.
 */
export async function addStaffMember(
  _prev:
    | { ok: boolean; userId?: string; reused?: boolean; error?: string }
    | null,
  formData: FormData,
): Promise<{ ok: boolean; userId?: string; reused?: boolean; error?: string }> {
  const parsed = Schema.safeParse({
    restaurant_id: formData.get("restaurant_id"),
    full_name: formData.get("full_name"),
    email: formData.get("email"),
    password: formData.get("password") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: "Datos inválidos. Revisa los campos." };
  }

  const { profile: admin, supabase } = await requireAdmin();

  // Verify the restaurant belongs to the admin's org (RLS does the gate, but
  // we want a clear error message if the URL was tampered with).
  const { data: rest, error: rErr } = await supabase
    .from("restaurants")
    .select("id, organization_id")
    .eq("id", parsed.data.restaurant_id)
    .single();
  if (rErr || !rest || rest.organization_id !== admin.organization_id) {
    return { ok: false, error: "Restaurante no encontrado." };
  }

  const adminDb = createSupabaseAdminClient();
  const email = parsed.data.email.trim().toLowerCase();

  // 1) Look up an existing auth user by email (service role).
  // listUsers has no `filter` parameter; we paginate through the small set
  // typical for this org. For most installs this is a few dozen rows.
  let existingUserId: string | null = null;
  let existingOrgId: string | null = null;
  {
    const { data: list, error } = await adminDb.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (error) {
      console.error("[addStaffMember] listUsers failed:", error);
      return { ok: false, error: "No se pudo verificar el correo." };
    }
    const match = list.users.find(
      (u) => (u.email ?? "").toLowerCase() === email,
    );
    if (match) {
      existingUserId = match.id;
      existingOrgId =
        (match.user_metadata?.organization_id as string | undefined) ?? null;
    }
  }

  let userId: string;
  let reused = false;

  if (existingUserId) {
    if (existingOrgId && existingOrgId !== admin.organization_id) {
      return {
        ok: false,
        error: "Ese correo pertenece a otra organización.",
      };
    }
    userId = existingUserId;
    reused = true;
  } else {
    // 2) Create the Auth user. The DB trigger handles profile creation.
    const password = parsed.data.password?.trim();
    if (!password) {
      return {
        ok: false,
        error: "Define una contraseña inicial para el nuevo staff.",
      };
    }
    const { data: created, error: createErr } =
      await adminDb.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: parsed.data.full_name,
          role: "staff",
          organization_id: admin.organization_id,
        },
      });
    if (createErr || !created.user) {
      console.error("[addStaffMember] createUser failed:", createErr);
      return {
        ok: false,
        error: createErr?.message ?? "No se pudo crear el usuario.",
      };
    }
    userId = created.user.id;
  }

  // 3) Assign the user to this restaurant. Composite-PK upsert keeps this
  // idempotent if the admin clicks twice.
  const { error: memberErr } = await adminDb
    .from("restaurant_members")
    .upsert(
      { user_id: userId, restaurant_id: parsed.data.restaurant_id },
      { onConflict: "user_id,restaurant_id", ignoreDuplicates: true },
    );
  if (memberErr) {
    console.error("[addStaffMember] member insert failed:", memberErr);
    return {
      ok: false,
      error: "Usuario creado pero no se pudo asignar al restaurante.",
    };
  }

  return { ok: true, userId, reused };
}
