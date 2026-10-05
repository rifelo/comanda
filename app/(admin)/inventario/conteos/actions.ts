"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getConteo } from "@/lib/inventario/conteos";
import { lineDiff } from "@/lib/inventario/conteo";
import { UNIDADES_STOCK } from "@/lib/inventario/propuestas";

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
  // Proposed items may add lines to this count: decide on them first.
  const { count: abiertas } = await supabase
    .from("inventario_conteo_propuestas")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("conteo_id", conteo.id)
    .eq("status", "pendiente");
  if ((abiertas ?? 0) > 0) return { ok: false, error: `Resuelve primero ${abiertas === 1 ? "el ítem propuesto" : `los ${abiertas} ítems propuestos`}.` };

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

// ── ítems propuestos desde la tablet ─────────────────────────────────────────
export type PropuestaResult = { ok: true } | { ok: false; error: string };

type Db = Awaited<ReturnType<typeof requireAdmin>>["supabase"];

async function propuestaAbierta(supabase: Db, orgId: string, id: string) {
  const { data } = await supabase
    .from("inventario_conteo_propuestas")
    .select("id, conteo_id, name, qty, unit, status")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  return data && data.status === "pendiente" ? data : null;
}

/** Close a proposal, guarded on 'pendiente' so two taps can't resolve it twice. */
async function cerrarPropuesta(supabase: Db, orgId: string, id: string, userId: string, status: "creado" | "unido" | "descartado", ingredienteId: string | null) {
  const { data } = await supabase
    .from("inventario_conteo_propuestas")
    .update({ status, ingrediente_id: ingredienteId, resolved_by: userId, resolved_at: new Date().toISOString() })
    .eq("organization_id", orgId)
    .eq("id", id)
    .eq("status", "pendiente")
    .select("id");
  return !!data?.length;
}

function revalidarConteo(conteoId: string) {
  revalidatePath("/inventario");
  revalidatePath("/inventario/conteos");
  revalidatePath(`/inventario/conteos/${conteoId}`);
  revalidatePath("/inventario/niveles");
}

const CrearSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  unit: z.enum(UNIDADES_STOCK),
  categoryId: z.string().uuid().nullable(),
  /** What was counted, in the stock unit chosen (the counter may have said "2 bolsas"). */
  qty: z.number().finite().min(0).max(9_999_999),
  costCop: z.number().finite().min(0).max(99_999_999).default(0),
});

/**
 * Create the item a counter proposed. It starts at zero and the counted
 * quantity enters as an 'ajuste', so the stock has a traceable origin.
 */
export async function crearDesdePropuesta(input: unknown): Promise<PropuestaResult> {
  const parsed = CrearSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revisa el nombre, la unidad y la cantidad." };
  const { user, profile, supabase } = await requireAdmin();
  const orgId = profile.organization_id;
  const d = parsed.data;
  const prop = await propuestaAbierta(supabase, orgId, d.id);
  if (!prop) return { ok: false, error: "Esta propuesta ya fue resuelta." };

  const { data: ing, error } = await supabase
    .from("ingredientes")
    .insert({ organization_id: orgId, category_id: d.categoryId, name: d.name, unit: d.unit, stock_current: 0, stock_min: 0, merma_pct: 0, cost_cop: d.costCop })
    .select("id")
    .single();
  if (error || !ing) {
    return { ok: false, error: error?.code === "23505" ? "Ya existe un ítem con ese nombre. Únelo a ese en vez de crearlo." : "No se pudo crear el ítem." };
  }
  if (!(await cerrarPropuesta(supabase, orgId, d.id, user.id, "creado", ing.id as string))) {
    await supabase.from("ingredientes").delete().eq("id", ing.id);
    return { ok: false, error: "Esta propuesta ya fue resuelta." };
  }
  if (d.qty > 0) {
    const { error: mErr } = await supabase.from("ingrediente_movements").insert({
      organization_id: orgId, ingrediente_id: ing.id, type: "ajuste", delta: d.qty, unit_cost_cop: d.costCop, note: "Conteo · ítem nuevo propuesto por el equipo", created_by: user.id,
    });
    if (mErr) console.error("[crearDesdePropuesta] movement:", mErr);
  }
  revalidarConteo(prop.conteo_id as string);
  return { ok: true };
}

const UnirSchema = z.object({
  id: z.string().uuid(),
  ingredienteId: z.string().uuid(),
  /** What was counted, in the existing item's stock unit. */
  qty: z.number().finite().min(0).max(9_999_999),
});

/**
 * The proposed thing already exists under another name: its quantity joins
 * this count as a line of that item (added to the line when the item was
 * also counted), so approving the count adjusts it with everything else.
 */
export async function unirPropuesta(input: unknown): Promise<PropuestaResult> {
  const parsed = UnirSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Elige el ítem y la cantidad." };
  const { user, profile, supabase } = await requireAdmin();
  const orgId = profile.organization_id;
  const d = parsed.data;
  const prop = await propuestaAbierta(supabase, orgId, d.id);
  if (!prop) return { ok: false, error: "Esta propuesta ya fue resuelta." };
  const conteoId = prop.conteo_id as string;
  const [{ data: conteo }, { data: ing }, { data: line }] = await Promise.all([
    supabase.from("inventario_conteos").select("status").eq("organization_id", orgId).eq("id", conteoId).maybeSingle(),
    supabase.from("ingredientes").select("id, stock_current, cost_cop").eq("organization_id", orgId).eq("id", d.ingredienteId).eq("archived", false).maybeSingle(),
    supabase.from("inventario_conteo_items").select("id, counted").eq("conteo_id", conteoId).eq("ingrediente_id", d.ingredienteId).maybeSingle(),
  ]);
  if (!conteo || conteo.status !== "pendiente") return { ok: false, error: "El conteo ya fue revisado: crea el ítem o descarta la propuesta." };
  if (!ing) return { ok: false, error: "Ese ítem ya no existe." };
  if (!(await cerrarPropuesta(supabase, orgId, d.id, user.id, "unido", d.ingredienteId))) return { ok: false, error: "Esta propuesta ya fue resuelta." };

  const note = `Propuesto como «${prop.name}»`;
  const { error } = line
    ? await supabase.from("inventario_conteo_items").update({ counted: Number(line.counted) + d.qty, note }).eq("id", line.id)
    : await supabase.from("inventario_conteo_items").insert({ conteo_id: conteoId, ingrediente_id: d.ingredienteId, expected: Number(ing.stock_current), counted: d.qty, unit_cost_cop: Number(ing.cost_cop ?? 0), note });
  if (error) {
    console.error("[unirPropuesta] line:", error);
    await supabase.from("inventario_conteo_propuestas").update({ status: "pendiente", ingrediente_id: null, resolved_by: null, resolved_at: null }).eq("id", d.id);
    return { ok: false, error: "No se pudo sumar al conteo." };
  }
  revalidarConteo(conteoId);
  return { ok: true };
}

/** Not an inventory item after all (a personal thing, a one-off): close it. */
export async function descartarPropuesta(input: unknown): Promise<PropuestaResult> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Propuesta inválida." };
  const { user, profile, supabase } = await requireAdmin();
  const prop = await propuestaAbierta(supabase, profile.organization_id, parsed.data.id);
  if (!prop) return { ok: false, error: "Esta propuesta ya fue resuelta." };
  await cerrarPropuesta(supabase, profile.organization_id, parsed.data.id, user.id, "descartado", null);
  revalidarConteo(prop.conteo_id as string);
  return { ok: true };
}
