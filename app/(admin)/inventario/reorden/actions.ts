"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { calcularParOrg } from "@/lib/inventario/agente/db";
import { todayInTz } from "@/lib/utils";

/** Recompute every item's reorder point now (the assistant also does it every night). */
export async function recalcularPar(): Promise<{ ok: true; n: number } | { ok: false; error: string }> {
  const [{ profile, supabase }, sede] = await Promise.all([requireAdmin(), getActiveSede()]);
  try {
    const r = await calcularParOrg(supabase, profile.organization_id, todayInTz(sede?.tz ?? "America/Bogota"));
    revalidatePath("/inventario/reorden");
    return { ok: true, n: r.size };
  } catch (e) {
    console.error("[recalcularPar]", e);
    return { ok: false, error: "No se pudo recalcular." };
  }
}
