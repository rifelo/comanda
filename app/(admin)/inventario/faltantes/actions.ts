"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin, requireUser } from "@/lib/auth";
import { resolverFaltante } from "@/lib/inventario/faltantes-db";

const PrioridadesSchema = z.object({
  items: z.array(z.object({ id: z.string().uuid(), prioridad: z.number().int().min(0).max(3) })).max(500),
});

/** Which ingredients make up the quick list and how critical each one is. */
export async function guardarPrioridades(input: unknown): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const parsed = PrioridadesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Lista inválida." };
  const { profile, supabase } = await requireAdmin();
  const orgId = profile.organization_id;
  // One update per distinct level (at most four round-trips).
  const byLevel = new Map<number, string[]>();
  for (const it of parsed.data.items) byLevel.set(it.prioridad, [...(byLevel.get(it.prioridad) ?? []), it.id]);
  for (const [prioridad, ids] of byLevel) {
    const { error } = await supabase.from("ingredientes").update({ prioridad }).eq("organization_id", orgId).in("id", ids);
    if (error) return { ok: false, error: "No se pudo guardar la lista." };
  }
  revalidatePath("/inventario/faltantes");
  revalidatePath("/turno/inventario");
  return { ok: true, count: parsed.data.items.filter((i) => i.prioridad > 0).length };
}

const ResolverSchema = z.object({ id: z.string().uuid(), note: z.string().trim().max(200).optional() });

/** Close an open report ("ya se repuso"). Any member may do it — whoever restocks. */
export async function resolverFaltanteAction(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = ResolverSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Faltante inválido." };
  const { user, profile, supabase } = await requireUser();
  const r = await resolverFaltante(supabase, profile.organization_id, parsed.data.id, user.id, parsed.data.note);
  if (r.ok) {
    revalidatePath("/inventario/faltantes");
    revalidatePath("/notificaciones");
    revalidatePath("/hoy");
    revalidatePath("/turno/inventario");
  }
  return r;
}
