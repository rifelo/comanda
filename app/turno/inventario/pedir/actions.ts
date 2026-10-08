"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTurnoContext } from "@/lib/turno/server";
import { piezaDe } from "@/lib/inventario/niveles";
import { todayInTz } from "@/lib/utils";

const Schema = z.object({
  ingredienteId: z.string().uuid().optional(),
  nombre: z.string().trim().min(2).max(80).optional(),
  /** In pieces when the item is counted in pieces, else in its unit. */
  qty: z.coerce.number().positive().max(100_000).optional(),
  note: z.string().trim().max(160).optional(),
}).refine((d) => !!d.ingredienteId || !!d.nombre);

export type PedirResult = { ok: true } | { ok: false; error: string };

/**
 * "Pedir algo más" from the tablet: one line for the owner's shopping list,
 * signed by the person logged in. An item of the inventory, or free text for
 * what the inventory doesn't have (soap, a spare part). Nothing is ordered
 * here — the owner turns the list into orders.
 */
export async function pedirAlgo(input: unknown): Promise<PedirResult> {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Escribe qué hace falta." };
  let ctx;
  try {
    ctx = await requireTurnoContext();
  } catch {
    return { ok: false, error: "Sin acceso. Inicia sesión otra vez en el tablet." };
  }
  const { admin, organizationId: orgId } = ctx;
  let qty = parsed.data.qty ?? null;
  if (parsed.data.ingredienteId) {
    const { data: ing } = await admin.from("ingredientes").select("id, unit, pack_qty, pieza_qty").eq("organization_id", orgId).eq("id", parsed.data.ingredienteId).maybeSingle();
    if (!ing) return { ok: false, error: "Ese ítem ya no existe." };
    const pieza = piezaDe({ unit: ing.unit as string, pack_qty: ing.pack_qty === null ? null : Number(ing.pack_qty), pieza_qty: ing.pieza_qty === null ? null : Number(ing.pieza_qty) });
    if (qty !== null && pieza) qty = Math.round(qty * pieza * 1000) / 1000;
  }
  const today = todayInTz(ctx.sede.tz);
  const { data: inst } = await admin
    .from("shift_instances")
    .select("id")
    .eq("restaurant_id", ctx.restaurantId)
    .eq("date", today)
    .eq("status", "open")
    .order("opened_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  const { error } = await admin.from("inventario_solicitudes").insert({
    organization_id: orgId,
    restaurant_id: ctx.restaurantId,
    shift_instance_id: (inst?.id as string | undefined) ?? null,
    ingrediente_id: parsed.data.ingredienteId ?? null,
    nombre: parsed.data.ingredienteId ? null : parsed.data.nombre,
    qty,
    note: parsed.data.note || null,
    requested_by: ctx.actor.profileId,
  });
  if (error) {
    console.error("[pedirAlgo]", error);
    return { ok: false, error: "No se pudo guardar. Intenta de nuevo." };
  }
  revalidatePath("/turno/inventario", "layout");
  revalidatePath("/compras");
  return { ok: true };
}
