"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTurnoContext } from "@/lib/turno/server";
import { piezaDe } from "@/lib/inventario/niveles";
import { errorMerma, MOTIVOS_MERMA, MOTIVO_MERMA, salidasMerma } from "@/lib/inventario/mermas";
import { todayInTz } from "@/lib/utils";

const Schema = z.object({
  kind: z.enum(["producto", "insumo"]),
  id: z.string().uuid(),
  /** Products in whole units; ingredients in pieces when counted in pieces, else in their unit. */
  qty: z.coerce.number().positive().max(10_000),
  motivo: z.enum(MOTIVOS_MERMA),
  justificacion: z.string().trim().max(300),
});

export type MermaResult = { ok: true; nombre: string } | { ok: false; error: string };

/**
 * A merma from the tablet, signed by the person logged in: a product takes
 * its whole recipe out of the inventory, an ingredient its quantity. The
 * row keeps the reason and the justification; the movements are type
 * «merma» and point back to it. Written with the service role.
 */
export async function registrarMerma(input: unknown): Promise<MermaResult> {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revisa los datos de la merma." };
  const d = parsed.data;
  const invalid = errorMerma({ qty: d.qty, motivo: d.motivo, justificacion: d.justificacion, producto: d.kind === "producto" });
  if (invalid) return { ok: false, error: invalid };
  let ctx;
  try {
    ctx = await requireTurnoContext();
  } catch {
    return { ok: false, error: "Sin acceso. Inicia sesión otra vez en el tablet." };
  }
  const { admin, organizationId: orgId } = ctx;

  let nombre: string;
  let unidad: string;
  let qty = d.qty;
  let plan: ReturnType<typeof salidasMerma>;
  if (d.kind === "producto") {
    const { data: prod } = await admin.from("productos").select("id, name").eq("organization_id", orgId).eq("id", d.id).maybeSingle();
    if (!prod) return { ok: false, error: "Ese producto ya no existe." };
    const { data: receta } = await admin
      .from("receta_items")
      .select("ingrediente_id, qty, ingredientes(cost_cop)")
      .eq("producto_id", d.id);
    if (!receta?.length) return { ok: false, error: "Ese producto no tiene receta: registra sus insumos uno por uno." };
    nombre = prod.name as string;
    unidad = "und";
    plan = salidasMerma({
      kind: "producto",
      qty,
      receta: receta.map((l) => {
        const ing = (Array.isArray(l.ingredientes) ? l.ingredientes[0] : l.ingredientes) as { cost_cop: number } | null;
        return { ingredienteId: l.ingrediente_id as string, qty: Number(l.qty), costo: Number(ing?.cost_cop ?? 0) };
      }),
    });
  } else {
    const { data: ing } = await admin.from("ingredientes").select("id, name, unit, cost_cop, pack_qty, pieza_qty").eq("organization_id", orgId).eq("id", d.id).eq("archived", false).maybeSingle();
    if (!ing) return { ok: false, error: "Ese insumo ya no existe." };
    const pieza = piezaDe({ unit: ing.unit as string, pack_qty: ing.pack_qty === null ? null : Number(ing.pack_qty), pieza_qty: ing.pieza_qty === null ? null : Number(ing.pieza_qty) });
    if (pieza) qty = Math.round(qty * pieza * 1000) / 1000;
    nombre = ing.name as string;
    unidad = ing.unit as string;
    plan = salidasMerma({ kind: "insumo", ingredienteId: ing.id as string, costo: Number(ing.cost_cop ?? 0), qty });
  }

  const { data: inst } = await admin
    .from("shift_instances")
    .select("id")
    .eq("restaurant_id", ctx.restaurantId)
    .eq("date", todayInTz(ctx.sede.tz))
    .eq("status", "open")
    .order("opened_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  const { data: merma, error } = await admin
    .from("inventario_mermas")
    .insert({
      organization_id: orgId,
      restaurant_id: ctx.restaurantId,
      shift_instance_id: (inst?.id as string | undefined) ?? null,
      producto_id: d.kind === "producto" ? d.id : null,
      ingrediente_id: d.kind === "insumo" ? d.id : null,
      nombre,
      qty,
      unidad,
      motivo: d.motivo,
      justificacion: d.justificacion.trim(),
      costo_cop: plan.costo,
      reported_by: ctx.actor.profileId,
    })
    .select("id")
    .single();
  if (error || !merma) {
    console.error("[registrarMerma] insert:", error);
    return { ok: false, error: "No se pudo guardar. Intenta de nuevo." };
  }
  // One multi-row insert: all the movements land or none does.
  const note = `Merma · ${d.kind === "producto" ? `${qty} × ${nombre} · ` : ""}${MOTIVO_MERMA[d.motivo].label} · ${d.justificacion.trim()}`.slice(0, 300);
  const { error: movErr } = await admin.from("ingrediente_movements").insert(
    plan.salidas.map((s) => ({
      organization_id: orgId,
      ingrediente_id: s.ingredienteId,
      type: "merma",
      delta: s.delta,
      unit_cost_cop: s.costoUnitario,
      note,
      created_by: ctx.actor.profileId,
      merma_id: merma.id,
    })),
  );
  if (movErr) {
    console.error("[registrarMerma] movements:", movErr);
    await admin.from("inventario_mermas").delete().eq("id", merma.id);
    return { ok: false, error: "No se pudo descontar del inventario. Intenta de nuevo." };
  }
  revalidatePath("/turno/inventario", "layout");
  revalidatePath("/inventario", "layout");
  return { ok: true, nombre };
}
