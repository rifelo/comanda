"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { errorGasto, type CategoriaGasto, type CuentaGasto } from "@/lib/gastos/gastos";
import { borrarGasto, crearGasto } from "@/lib/gastos/gastos-db";

export type GastoActionResult = { ok: true } | { ok: false; error: string };

const GastoSchema = z.object({
  fecha: z.string(),
  categoria: z.string(),
  concepto: z.string().max(200),
  monto: z.number(),
  cuenta: z.string(),
  note: z.string().max(500).optional(),
});

function revalidar(fecha: string) {
  revalidatePath("/gastos");
  revalidatePath("/numeros");
  revalidatePath(`/numeros/${fecha}`);
}

export async function registrarGasto(input: unknown): Promise<GastoActionResult> {
  const parsed = GastoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Gasto inválido." };
  const g = parsed.data;
  const err = errorGasto(g);
  if (err) return { ok: false, error: err };
  const [{ user, profile, supabase }, sede] = await Promise.all([requireAdmin(), getActiveSede()]);
  const r = await crearGasto(supabase, {
    orgId: profile.organization_id,
    restaurantId: sede?.id ?? null,
    fecha: g.fecha,
    categoria: g.categoria as CategoriaGasto,
    concepto: g.concepto,
    monto: Math.round(g.monto * 100) / 100,
    cuenta: g.cuenta as CuentaGasto,
    note: g.note ?? null,
    by: user.id,
  });
  if (!r.ok) return r;
  revalidar(g.fecha);
  return { ok: true };
}

export async function eliminarGasto(id: string): Promise<GastoActionResult> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Gasto inválido." };
  const { profile, supabase } = await requireAdmin();
  const r = await borrarGasto(supabase, profile.organization_id, id);
  if (!r.ok) return r;
  revalidar(r.fecha);
  return { ok: true };
}
