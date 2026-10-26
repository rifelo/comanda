"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTurnoContext, type TurnoContext } from "@/lib/turno/server";
import { registrarEstados } from "@/lib/inventario/faltantes-db";
import { MARCAS } from "@/lib/inventario/acabando";
import { ZONAS } from "@/lib/inventario/niveles";
import { mismoNombre } from "@/lib/inventario/propuestas";
import { yaSugerida } from "@/lib/inventario/sugerencias";
import { todayInTz } from "@/lib/utils";

export type MarcarResult = { ok: true; count: number } | { ok: false; error: string; sinAcceso?: boolean };
export type AgregarResult = { ok: true; repetida: boolean } | { ok: false; error: string; existe?: { id: string; name: string } };

function revalidate(today: string) {
  revalidatePath("/turno/inventario", "layout");
  revalidatePath("/inventario", "layout");
  revalidatePath("/compras");
  revalidatePath("/notificaciones");
  revalidatePath(`/hoy/${today}`);
}

async function contexto(): Promise<TurnoContext | null> {
  try {
    return await requireTurnoContext();
  } catch {
    return null;
  }
}

/** Today's open turno at this sede, if any: the marks hang off it. */
async function turnoDeHoy(ctx: TurnoContext, today: string): Promise<string | null> {
  const { data } = await ctx.admin
    .from("shift_instances")
    .select("id")
    .eq("restaurant_id", ctx.restaurantId)
    .eq("date", today)
    .eq("status", "open")
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

const MarcarSchema = z.object({
  items: z
    .array(
      z.object({
        ingredienteId: z.string().uuid(),
        marca: z.enum(["hay", "poco", "agotado"]),
        note: z.string().trim().max(120).nullable().optional(),
        at: z.string().max(40).optional(),
      }),
    )
    .min(1)
    .max(300),
});

/**
 * One tap on «¿Qué se está acabando?» (or the taps the tablet queued while
 * offline), signed by whoever is logged in. Each becomes the item's current
 * state; «hay» closes what was open for it.
 */
export async function marcarInsumos(input: unknown): Promise<MarcarResult> {
  const parsed = MarcarSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Marca inválida." };
  const ctx = await contexto();
  if (!ctx) return { ok: false, error: "Sin acceso. Inicia sesión otra vez en el tablet.", sinAcceso: true };
  const today = todayInTz(ctx.sede.tz);
  const res = await registrarEstados(
    ctx.admin,
    { orgId: ctx.organizationId, restaurantId: ctx.restaurantId, shiftInstanceId: await turnoDeHoy(ctx, today), profileId: ctx.actor.profileId },
    parsed.data.items.map((i) => ({ ingredienteId: i.ingredienteId, estado: MARCAS[i.marca].estado, note: i.note ?? undefined, at: i.at })),
  );
  if (res.ok) revalidate(today);
  return res;
}

const AgregarSchema = z.object({
  nombre: z.string().trim().min(2).max(80),
  zona: z.enum(ZONAS),
  marca: z.enum(["poco", "agotado"]),
  nota: z.string().trim().max(200).optional(),
});

/**
 * «Algo que no está en la lista»: it is saved as a new-item suggestion,
 * already marked, and the owner sees it in Por pedir to add it and order it.
 * A name the list already has is answered with that item, so the tablet can
 * mark it instead of creating a repeated one.
 */
export async function agregarNoListado(input: unknown): Promise<AgregarResult> {
  const parsed = AgregarSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Escribe qué se acabó." };
  const d = parsed.data;
  const ctx = await contexto();
  if (!ctx) return { ok: false, error: "Sin acceso. Inicia sesión otra vez en el tablet." };
  const { admin, organizationId: orgId } = ctx;
  const [{ data: ings }, { data: abiertas }] = await Promise.all([
    admin.from("ingredientes").select("id, name").eq("organization_id", orgId).eq("archived", false),
    admin.from("inventario_sugerencias").select("zona, tipo, ingrediente_id, nombre").eq("organization_id", orgId).eq("status", "pendiente"),
  ]);
  const igual = (ings ?? []).find((i) => mismoNombre(i.name as string, d.nombre));
  if (igual) return { ok: false, error: `Ya está en la lista como «${igual.name}».`, existe: { id: igual.id as string, name: igual.name as string } };
  if (yaSugerida({ zona: d.zona, tipo: "nuevo", nombre: d.nombre }, abiertas ?? [])) return { ok: true, repetida: true };
  const { error } = await admin.from("inventario_sugerencias").insert({
    organization_id: orgId,
    restaurant_id: ctx.restaurantId,
    zona: d.zona,
    tipo: "nuevo",
    nombre: d.nombre.charAt(0).toUpperCase() + d.nombre.slice(1),
    nota: d.nota || null,
    estado: MARCAS[d.marca].estado,
    sugerido_por: ctx.actor.profileId,
  });
  if (error) {
    console.error("[agregarNoListado]", error);
    return { ok: false, error: "No se pudo guardar. Intenta de nuevo." };
  }
  revalidate(todayInTz(ctx.sede.tz));
  return { ok: true, repetida: false };
}
