"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTurnoContext } from "@/lib/turno/server";
import {
  DENOMINACIONES_COP,
  diferenciaCaja,
  entregaCaja,
  esperadoCaja,
  totalContado,
  ventanaTurno,
  type ResumenPagos,
} from "@/lib/caja/arqueo";
import { sumPagosVentana } from "@/lib/caja/cierres";

const VALID = new Set<number>(DENOMINACIONES_COP);

const Schema = z.object({
  shiftInstanceId: z.string().uuid(),
  denominaciones: z
    .array(z.object({ valor: z.number().int().positive(), cantidad: z.number().int().min(0).max(100_000) }))
    .max(20)
    .refine((list) => list.every((d) => VALID.has(d.valor)), "denominación desconocida"),
  baseInicial: z.number().int().min(0).max(50_000_000),
  baseDejada: z.number().int().min(0).max(50_000_000),
  note: z.string().trim().max(300).optional(),
});

export type EnviarCierreResult =
  | {
      ok: true;
      cierreId: string;
      contado: number;
      esperado: number;
      diferencia: number;
      baseInicial: number;
      baseDejada: number;
      entrega: number;
      pagos: ResumenPagos;
      ventana: { desde: string; hasta: string };
    }
  | { ok: false; error: string };

/**
 * Store the cash count from the tablet, signed by the person logged in on it.
 * Blind on screen: the expected cash is computed HERE, from the POS payments
 * inside the turno's window, and stored on the row so the owner sees exactly
 * which sales were compared.
 *
 * Window: the instance's `date` is a wall-clock day in the sede's timezone
 * and `inicio` a time on that day. It runs from `opened_at` (the first tick)
 * or the scheduled start when nobody ticked anything, until `closed_at` or
 * now. PAYO's night shift ends 21:00, so no day wrap is involved; the helper
 * still never inverts the window.
 */
export async function enviarCierreCaja(input: unknown): Promise<EnviarCierreResult> {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Cierre inválido." };
  let ctx;
  try {
    ctx = await requireTurnoContext();
  } catch {
    return { ok: false, error: "Sin acceso. Inicia sesión otra vez en el tablet." };
  }
  const { admin } = ctx;

  const { data: inst } = await admin
    .from("shift_instances")
    .select("id, date, opened_at, closed_at, template:checklist_templates!inner(inicio)")
    .eq("id", parsed.data.shiftInstanceId)
    .eq("restaurant_id", ctx.restaurantId)
    .maybeSingle();
  if (!inst) return { ok: false, error: "Turno no encontrado." };

  const { data: live } = await admin
    .from("caja_cierres")
    .select("id")
    .eq("shift_instance_id", inst.id)
    .neq("status", "rechazado")
    .limit(1)
    .maybeSingle();
  if (live) return { ok: false, error: "Ya hay un cierre de caja para este turno." };

  const template = inst.template as unknown as { inicio: string };
  const ventana = ventanaTurno({
    date: inst.date as string,
    inicio: template.inicio,
    tz: ctx.sede.tz,
    opened_at: (inst.opened_at as string | null) ?? null,
    closed_at: (inst.closed_at as string | null) ?? null,
  });
  const pagos = await sumPagosVentana(admin, {
    orgId: ctx.organizationId,
    restaurantId: ctx.restaurantId,
    desde: ventana.desde,
    hasta: ventana.hasta,
  });

  const denominaciones = parsed.data.denominaciones.filter((d) => d.cantidad > 0).sort((a, b) => b.valor - a.valor);
  const contado = totalContado(denominaciones);
  const esperado = esperadoCaja(parsed.data.baseInicial, pagos.efectivo);
  const diferencia = diferenciaCaja(contado, esperado);

  const { data: row, error } = await admin
    .from("caja_cierres")
    .insert({
      organization_id: ctx.organizationId,
      restaurant_id: ctx.restaurantId,
      shift_instance_id: inst.id,
      counted_by: ctx.actor.profileId,
      note: parsed.data.note || null,
      ventana_desde: ventana.desde,
      ventana_hasta: ventana.hasta,
      base_inicial_cop: parsed.data.baseInicial,
      efectivo_cop: pagos.efectivo,
      tarjeta_cop: pagos.tarjeta,
      transferencia_cop: pagos.transferencia,
      pagos_count: pagos.count,
      esperado_cop: esperado,
      contado_cop: contado,
      diferencia_cop: diferencia,
      base_dejada_cop: parsed.data.baseDejada,
      denominaciones,
    })
    .select("id")
    .single();
  if (error || !row) {
    // 23505 = the partial unique index: someone sent one a moment ago.
    if (error?.code === "23505") return { ok: false, error: "Ya hay un cierre de caja para este turno." };
    console.error("[enviarCierreCaja] insert:", error);
    return { ok: false, error: "No se pudo guardar el cierre." };
  }
  revalidatePath("/turno/caja");
  revalidatePath("/turno");
  revalidatePath(`/hoy/${inst.date as string}`);
  return {
    ok: true,
    cierreId: row.id as string,
    contado,
    esperado,
    diferencia,
    baseInicial: parsed.data.baseInicial,
    baseDejada: parsed.data.baseDejada,
    entrega: entregaCaja(contado, parsed.data.baseDejada),
    pagos,
    ventana,
  };
}
