"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getUserAndProfile } from "@/lib/auth";

// `"use server"` files can only export async functions in Next 16. Result
// shape for createOrganization:
//   type CreateOrgResult = { ok: boolean; error?: string }

const OrgNameSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

/**
 * Create a new organization, making the current user its owner (admin) and
 * switching their active-org pointer to it. The insert is gated by the
 * `create_organization` security-definer RPC (organizations has no INSERT
 * policy). On success we redirect to `/`, which re-routes by role.
 */
export async function createOrganization(
  _prev: { ok: boolean; error?: string } | null,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = OrgNameSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { ok: false, error: "Escribe un nombre válido (1–80 caracteres)." };
  }

  const { supabase } = await getUserAndProfile();
  const { error } = await supabase.rpc("create_organization", {
    org_name: parsed.data.name,
  });

  if (error) {
    console.error("[createOrganization] rpc failed:", error);
    return { ok: false, error: "No se pudo crear la organización." };
  }

  // redirect() throws — keep it outside the rpc error handling above.
  redirect("/");
}

/**
 * Switch the current user's active-org pointer to one of their memberships.
 * The `switch_organization` RPC raises if the caller isn't a member, and the
 * `profiles update own row` WITH CHECK policy backs that up.
 */
export async function switchOrganization(formData: FormData): Promise<void> {
  const target = formData.get("organization_id");
  if (typeof target !== "string" || target.length === 0) {
    redirect("/organizaciones");
  }

  const { supabase } = await getUserAndProfile();
  await supabase.rpc("switch_organization", { target });

  // redirect() throws — outside any try/catch around the rpc.
  redirect("/");
}
