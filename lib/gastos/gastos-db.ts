import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CategoriaGasto, CuentaGasto } from "./gastos";

// Business expenses (gastos, 0056). Owner-only under RLS, so these take the
// admin's RLS client; nothing here runs from the tablet.

export interface Gasto {
  id: string;
  fecha: string;
  categoria: CategoriaGasto;
  concepto: string;
  monto: number;
  cuenta: CuentaGasto;
  note: string | null;
  createdAt: string;
  by: string | null;
}

const COLS = "id, fecha, categoria, concepto, monto_cop, cuenta, note, created_at, quien:profiles!gastos_registered_by_fkey(full_name)";

/** Expenses with `desde <= fecha <= hasta` (YYYY-MM-DD), newest day first. */
export async function listGastos(db: SupabaseClient, orgId: string, desde: string, hasta: string): Promise<Gasto[]> {
  const { data, error } = await db
    .from("gastos")
    .select(COLS)
    .eq("organization_id", orgId)
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    console.error("[listGastos]", error);
    return [];
  }
  return (data ?? []).map((r) => {
    const quien = (Array.isArray(r.quien) ? r.quien[0] : r.quien) as { full_name: string | null } | null;
    return {
      id: r.id as string,
      fecha: r.fecha as string,
      categoria: r.categoria as CategoriaGasto,
      concepto: r.concepto as string,
      monto: Number(r.monto_cop),
      cuenta: r.cuenta as CuentaGasto,
      note: (r.note as string | null) ?? null,
      createdAt: r.created_at as string,
      by: quien?.full_name ?? null,
    };
  });
}

/** Store one expense. The caller has validated it (errorGasto). */
export async function crearGasto(
  db: SupabaseClient,
  g: { orgId: string; restaurantId: string | null; fecha: string; categoria: CategoriaGasto; concepto: string; monto: number; cuenta: CuentaGasto; note: string | null; by: string },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data, error } = await db
    .from("gastos")
    .insert({
      organization_id: g.orgId,
      restaurant_id: g.restaurantId,
      fecha: g.fecha,
      categoria: g.categoria,
      concepto: g.concepto.trim(),
      monto_cop: g.monto,
      cuenta: g.cuenta,
      note: g.note?.trim() || null,
      registered_by: g.by,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[crearGasto]", error);
    return { ok: false, error: "No se pudo guardar el gasto." };
  }
  return { ok: true, id: data.id as string };
}

export async function borrarGasto(db: SupabaseClient, orgId: string, id: string): Promise<{ ok: true; fecha: string } | { ok: false; error: string }> {
  const { data, error } = await db.from("gastos").delete().eq("organization_id", orgId).eq("id", id).select("fecha");
  if (error) {
    console.error("[borrarGasto]", error);
    return { ok: false, error: "No se pudo borrar el gasto." };
  }
  if (!data?.length) return { ok: false, error: "Ese gasto ya no existe." };
  return { ok: true, fecha: data[0].fecha as string };
}
