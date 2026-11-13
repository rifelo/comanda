"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPosCatalog } from "@/lib/pos/catalog";
import { repricearOrden } from "@/lib/pos/descuentos-db";

const Schema = z.object({ id: z.string().uuid(), aprobar: z.boolean(), respuesta: z.string().trim().max(200).optional() });

/**
 * The owner answers a discount request. Approving re-prices the order's
 * lines right away (the register sees the new total on its next refresh);
 * it fails if the order was already charged or cancelled in the meantime.
 */
export async function resolverDescuento(input: z.infer<typeof Schema>): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };
  const { profile } = await requireAdmin();
  const orgId = profile.organization_id;
  const db = createSupabaseAdminClient();
  const { id, aprobar, respuesta } = parsed.data;
  const now = new Date().toISOString();

  const { data: claimed, error } = await db
    .from("orden_descuentos")
    .update({ estado: aprobar ? "aprobado" : "rechazado", resuelto_por: profile.id, resuelto_at: now, respuesta: respuesta || null })
    .eq("id", id)
    .eq("organization_id", orgId)
    .eq("estado", "pendiente")
    .select("orden_id")
    .maybeSingle();
  if (error) return { ok: false, error: "No se pudo guardar la respuesta." };
  if (!claimed) return { ok: false, error: "Esta solicitud ya fue respondida o retirada." };

  if (aprobar) {
    const catalog = await getPosCatalog({ organizationId: orgId, userId: null, orgName: "", client: db });
    const r = await repricearOrden(db, orgId, claimed.orden_id as string, catalog);
    if (!r.ok) {
      await db.from("orden_descuentos").update({ estado: "pendiente", resuelto_por: null, resuelto_at: null, respuesta: null }).eq("id", id);
      return { ok: false, error: r.error };
    }
    await db.from("orden_descuentos").update({ total_antes_cop: r.antes, total_despues_cop: r.total }).eq("id", id);
  }
  revalidatePath("/descuentos");
  revalidatePath(`/descuentos/${id}`);
  revalidatePath("/hoy");
  return { ok: true };
}
