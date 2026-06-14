import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MovimientoRow } from "@/lib/movimientos";

/**
 * Stock movements (audit log) for the Movimientos view — reads the existing
 * `ingrediente_movements` table (written by the inventario stock flows), newest
 * first, hydrated with the ingrediente name and the author's display name.
 */
export async function getMovimientos(
  organizationId: string,
  { limit = 200 }: { limit?: number } = {},
): Promise<MovimientoRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("ingrediente_movements")
    .select(
      "id, type, delta, balance_after, unit_cost_cop, note, created_at, ingredientes(name), profiles(full_name)",
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((m) => ({
    id: m.id as string,
    created_at: m.created_at as string,
    type: m.type as MovimientoRow["type"],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ingrediente_name: ((m as any).ingredientes?.name ?? "—") as string,
    delta: Number(m.delta),
    balance_after: Number(m.balance_after),
    unit_cost_cop: m.unit_cost_cop == null ? null : Number(m.unit_cost_cop),
    note: (m.note as string | null) ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    by_name: ((m as any).profiles?.full_name ?? null) as string | null,
  }));
}
