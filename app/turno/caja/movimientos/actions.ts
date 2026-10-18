"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTurnoContext } from "@/lib/turno/server";
import { todayInTz } from "@/lib/utils";
import { errorMovimiento, MOTIVOS_CAJA } from "@/lib/caja/movimientos";
import { crearMovimiento, turnoAbierto } from "@/lib/caja/movimientos-db";

const Schema = z.object({
  tipo: z.enum(["ingreso", "salida"]),
  monto: z.number().int(),
  motivo: z.enum(MOTIVOS_CAJA),
  justificacion: z.string().trim().max(300),
});

/**
 * A cash movement from the tablet (sencillo in, a small purchase out…),
 * signed by the person logged in. An order paid in cash is not registered
 * here: Recibir creates that salida tied to the order.
 */
export async function registrarMovimientoCaja(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revisa los datos del movimiento." };
  const d = parsed.data;
  if (d.motivo === "pago_pedido") return { ok: false, error: "El pago de un pedido se registra al recibirlo (Inventario → Pedidos por llegar)." };
  const invalid = errorMovimiento({ tipo: d.tipo, monto: d.monto, motivo: d.motivo, justificacion: d.justificacion });
  if (invalid) return { ok: false, error: invalid };
  let ctx;
  try {
    ctx = await requireTurnoContext();
  } catch {
    return { ok: false, error: "Sin acceso. Inicia sesión otra vez en el tablet." };
  }
  const shiftInstanceId = await turnoAbierto(ctx.admin, ctx.restaurantId, todayInTz(ctx.sede.tz));
  const r = await crearMovimiento(ctx.admin, { orgId: ctx.organizationId, restaurantId: ctx.restaurantId, shiftInstanceId, tipo: d.tipo, monto: d.monto, motivo: d.motivo, justificacion: d.justificacion, by: ctx.actor.profileId });
  if (!r.ok) return r;
  revalidatePath("/turno/caja", "layout");
  revalidatePath("/caja");
  return { ok: true };
}
