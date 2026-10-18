"use server";

import { redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";

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
