"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { UNIDADES_STOCK } from "@/lib/inventario/propuestas";

export type SugerenciaResult = { ok: true } | { ok: false; error: string };

function revalidate() {
  revalidatePath("/inventario", "layout");
  revalidatePath("/turno/inventario", "layout");
  revalidatePath("/turno/conteo");
}

type Db = Awaited<ReturnType<typeof requireAdmin>>["supabase"];
async function abierta(db: Db, orgId: string, id: string) {
  const { data } = await db.from("inventario_sugerencias").select("id, zona, tipo, ingrediente_id, nombre").eq("organization_id", orgId).eq("id", id).eq("status", "pendiente").maybeSingle();
  return data;
}
async function cerrar(db: Db, orgId: string, id: string, userId: string, status: "aplicada" | "descartada", resultado: string | null) {
  const { data } = await db
    .from("inventario_sugerencias")
    .update({ status, resultado_ingrediente_id: resultado, resolved_by: userId, resolved_at: new Date().toISOString() })
    .eq("organization_id", orgId)
    .eq("id", id)
    .eq("status", "pendiente")
    .select("id");
  return !!data?.length;
}

const Id = z.object({ id: z.string().uuid() });

/** «Va en esta sección»: the item moves to the suggested section (the walked count follows it). */
export async function aplicarUbicacion(input: unknown): Promise<SugerenciaResult> {
  const parsed = Id.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Sugerencia inválida." };
  const { user, profile, supabase } = await requireAdmin();
  const s = await abierta(supabase, profile.organization_id, parsed.data.id);
  if (!s || s.tipo !== "ubicacion" || !s.ingrediente_id) return { ok: false, error: "Esta sugerencia ya fue resuelta." };
  const { error } = await supabase.from("ingredientes").update({ ubicacion: s.zona }).eq("organization_id", profile.organization_id).eq("id", s.ingrediente_id);
  if (error) return { ok: false, error: "No se pudo mover el ítem." };
  await cerrar(supabase, profile.organization_id, s.id, user.id, "aplicada", s.ingrediente_id);
  revalidate();
  return { ok: true };
}

const CrearSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(80),
  unit: z.enum(UNIDADES_STOCK),
  categoryId: z.string().uuid().nullable(),
});

/** «Falta en la lista» → a new item in that section, stock 0 (the next count sets it). */
export async function crearDesdeSugerencia(input: unknown): Promise<SugerenciaResult> {
  const parsed = CrearSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revisa el nombre y la unidad." };
  const { user, profile, supabase } = await requireAdmin();
  const orgId = profile.organization_id;
  const s = await abierta(supabase, orgId, parsed.data.id);
  if (!s || s.tipo !== "nuevo") return { ok: false, error: "Esta sugerencia ya fue resuelta." };
  const { data: ing, error } = await supabase
    .from("ingredientes")
    .insert({ organization_id: orgId, category_id: parsed.data.categoryId, name: parsed.data.name, unit: parsed.data.unit, ubicacion: s.zona, stock_current: 0, stock_min: 0, merma_pct: 0, cost_cop: 0 })
    .select("id")
    .single();
  if (error || !ing) return { ok: false, error: error?.code === "23505" ? "Ya existe un ítem con ese nombre: únelo a ese." : "No se pudo crear el ítem." };
  if (!(await cerrar(supabase, orgId, s.id, user.id, "aplicada", ing.id as string))) {
    await supabase.from("ingredientes").delete().eq("id", ing.id);
    return { ok: false, error: "Esta sugerencia ya fue resuelta." };
  }
  revalidate();
  return { ok: true };
}

const UnirSchema = z.object({ id: z.string().uuid(), ingredienteId: z.string().uuid() });

/** The suggested thing already exists under another name: that item moves to the section. */
export async function unirSugerencia(input: unknown): Promise<SugerenciaResult> {
  const parsed = UnirSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Elige el ítem." };
  const { user, profile, supabase } = await requireAdmin();
  const orgId = profile.organization_id;
  const s = await abierta(supabase, orgId, parsed.data.id);
  if (!s) return { ok: false, error: "Esta sugerencia ya fue resuelta." };
  const { error } = await supabase.from("ingredientes").update({ ubicacion: s.zona }).eq("organization_id", orgId).eq("id", parsed.data.ingredienteId);
  if (error) return { ok: false, error: "No se pudo mover el ítem." };
  await cerrar(supabase, orgId, s.id, user.id, "aplicada", parsed.data.ingredienteId);
  revalidate();
  return { ok: true };
}

export async function descartarSugerencia(input: unknown): Promise<SugerenciaResult> {
  const parsed = Id.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Sugerencia inválida." };
  const { user, profile, supabase } = await requireAdmin();
  if (!(await cerrar(supabase, profile.organization_id, parsed.data.id, user.id, "descartada", null))) return { ok: false, error: "Esta sugerencia ya fue resuelta." };
  revalidate();
  return { ok: true };
}
