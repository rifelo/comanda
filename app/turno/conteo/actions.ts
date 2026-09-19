"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTurnoContext } from "@/lib/turno/server";
import { conteoSummary, lineDiff, type ConteoSummary } from "@/lib/inventario/conteo";

const Schema = z.object({
  kind: z.enum(["diario", "completo"]),
  note: z.string().trim().max(300).optional(),
  items: z
    .array(z.object({
      ingredienteId: z.string().uuid(),
      counted: z.coerce.number().min(0).max(1_000_000),
      note: z.string().trim().max(120).optional(),
    }))
    .min(1)
    .max(300),
});

export interface ConteoResultLine {
  ingredienteId: string;
  name: string;
  unit: string;
  expected: number;
  counted: number;
  diff: number;
  value: number;
}
export type EnviarConteoResult =
  | { ok: true; conteoId: string; lines: ConteoResultLine[]; summary: ConteoSummary }
  | { ok: false; error: string };

/**
 * Store a physical count from the tablet, signed by the person logged in on
 * it. The count is blind on screen; here
 * every line gets the stock the system expected at this instant and the cost
 * that values the difference. Nothing moves stock — the owner approves the
 * count from the panel, and that creates the adjustments.
 */
export async function enviarConteo(input: unknown): Promise<EnviarConteoResult> {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Conteo inválido." };
  let ctx;
  try {
    ctx = await requireTurnoContext();
  } catch {
    return { ok: false, error: "Sin acceso. Inicia sesión otra vez en el tablet." };
  }
  const { admin, organizationId: orgId } = ctx;
  const ids = [...new Set(parsed.data.items.map((i) => i.ingredienteId))];
  const { data: ings } = await admin
    .from("ingredientes")
    .select("id, name, unit, stock_current, cost_cop")
    .eq("organization_id", orgId)
    .in("id", ids);
  const byId = new Map((ings ?? []).map((i) => [i.id as string, i]));
  if (byId.size !== ids.length) return { ok: false, error: "Un ingrediente del conteo ya no existe." };

  // Today's open turno, if any, so the count hangs off the shift being closed.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: ctx.sede.tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const { data: inst } = await admin
    .from("shift_instances")
    .select("id")
    .eq("restaurant_id", ctx.restaurantId)
    .eq("date", today)
    .eq("status", "open")
    .limit(1)
    .maybeSingle();

  const { data: conteo, error: cErr } = await admin
    .from("inventario_conteos")
    .insert({
      organization_id: orgId,
      restaurant_id: ctx.restaurantId,
      shift_instance_id: inst?.id ?? null,
      kind: parsed.data.kind,
      counted_by: ctx.actor.profileId,
      note: parsed.data.note || null,
    })
    .select("id")
    .single();
  if (cErr || !conteo) {
    console.error("[enviarConteo] insert conteo:", cErr);
    return { ok: false, error: "No se pudo guardar el conteo." };
  }
  const rows = parsed.data.items.map((it) => {
    const ing = byId.get(it.ingredienteId)!;
    return {
      conteo_id: conteo.id as string,
      ingrediente_id: it.ingredienteId,
      expected: Number(ing.stock_current),
      counted: it.counted,
      unit_cost_cop: Number(ing.cost_cop ?? 0),
      note: it.note || null,
    };
  });
  const { error: iErr } = await admin.from("inventario_conteo_items").insert(rows);
  if (iErr) {
    await admin.from("inventario_conteos").delete().eq("id", conteo.id);
    console.error("[enviarConteo] insert items:", iErr);
    return { ok: false, error: "No se pudieron guardar las líneas del conteo." };
  }
  revalidatePath("/turno/conteo");
  revalidatePath("/inventario/conteos");
  const lines = rows.map((r) => {
    const ing = byId.get(r.ingrediente_id)!;
    const d = lineDiff(r);
    return { ingredienteId: r.ingrediente_id, name: ing.name as string, unit: ing.unit as string, expected: r.expected, counted: r.counted, diff: d.diff, value: d.value };
  });
  return { ok: true, conteoId: conteo.id as string, lines, summary: conteoSummary(rows) };
}
