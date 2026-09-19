"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getConteo } from "@/lib/inventario/conteos";
import { lineDiff } from "@/lib/inventario/conteo";

export type ConteoActionResult = { ok: true; adjusted: number } | { ok: false; error: string };

const IdSchema = z.object({ id: z.string().uuid(), note: z.string().trim().max(300).optional() });

function dateLabel(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 5 * 3_600_000); // Bogotá, no DST
  return d.toISOString().slice(0, 10);
}

/**
 * Approve a count: every line whose counted quantity differs from what the
 * system expected at count time becomes an 'ajuste' movement for that
 * difference (sales since then are already in the stock, so the delta is
 * against the snapshot, not today's number). The status flips first, guarded
 * on 'pendiente', so a double tap can't apply the adjustments twice.
 */
export async function aprobarConteo(input: unknown): Promise<ConteoActionResult> {
  const parsed = IdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Conteo inválido." };
  const { user, profile, supabase } = await requireAdmin();
  const orgId = profile.organization_id;
  const conteo = await getConteo(supabase, orgId, parsed.data.id);
  if (!conteo) return { ok: false, error: "Conteo no encontrado." };
  if (conteo.status !== "pendiente") return { ok: false, error: "Este conteo ya fue revisado." };

  const { data: flipped, error: fErr } = await supabase
    .from("inventario_conteos")
    .update({ status: "aprobado", reviewed_by: user.id, reviewed_at: new Date().toISOString(), review_note: parsed.data.note || null })
    .eq("id", conteo.id)
    .eq("organization_id", orgId)
    .eq("status", "pendiente")
    .select("id");
  if (fErr || !flipped?.length) return { ok: false, error: "Este conteo ya fue revisado." };

  const label = `Conteo ${conteo.kind} ${dateLabel(conteo.submitted_at)}`;
  const movements = conteo.items
    .map((it) => ({ it, diff: lineDiff(it).diff }))
    .filter(({ diff }) => diff !== 0)
    .map(({ it, diff }) => ({
      organization_id: orgId,
      ingrediente_id: it.ingrediente_id,
      type: "ajuste" as const,
      delta: diff,
      note: `${label}${it.note ? ` · ${it.note}` : ""}`,
      created_by: user.id,
    }));
  if (movements.length) {
    const { error } = await supabase.from("ingrediente_movements").insert(movements);
    if (error) {
      console.error("[aprobarConteo] movements:", error);
      await supabase.from("inventario_conteos").update({ status: "pendiente", reviewed_by: null, reviewed_at: null, review_note: null }).eq("id", conteo.id);
      return { ok: false, error: "No se pudieron aplicar los ajustes." };
    }
  }
  revalidatePath("/inventario");
  revalidatePath("/inventario/conteos");
  revalidatePath(`/inventario/conteos/${conteo.id}`);
  return { ok: true, adjusted: movements.length };
}

/** Reject a count (nothing moves); the note tells the team why, e.g. "recontar la leche". */
export async function rechazarConteo(input: unknown): Promise<ConteoActionResult> {
  const parsed = IdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Conteo inválido." };
  const { user, profile, supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from("inventario_conteos")
    .update({ status: "rechazado", reviewed_by: user.id, reviewed_at: new Date().toISOString(), review_note: parsed.data.note || null })
    .eq("id", parsed.data.id)
    .eq("organization_id", profile.organization_id)
    .eq("status", "pendiente")
    .select("id");
  if (error || !data?.length) return { ok: false, error: "Este conteo ya fue revisado." };
  revalidatePath("/inventario/conteos");
  revalidatePath(`/inventario/conteos/${parsed.data.id}`);
  return { ok: true, adjusted: 0 };
}

const ListaSchema = z.object({ ids: z.array(z.string().uuid()).max(500) });

/** Which ingredients make up the short daily list. */
export async function guardarListaDiaria(input: unknown): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const parsed = ListaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Lista inválida." };
  const { profile, supabase } = await requireAdmin();
  const orgId = profile.organization_id;
  const { error: offErr } = await supabase.from("ingredientes").update({ conteo_diario: false }).eq("organization_id", orgId).eq("conteo_diario", true);
  if (offErr) return { ok: false, error: "No se pudo guardar la lista." };
  if (parsed.data.ids.length) {
    const { error } = await supabase.from("ingredientes").update({ conteo_diario: true }).eq("organization_id", orgId).in("id", parsed.data.ids);
    if (error) return { ok: false, error: "No se pudo guardar la lista." };
  }
  revalidatePath("/inventario/conteos");
  revalidatePath("/turno/conteo");
  return { ok: true, count: parsed.data.ids.length };
}
