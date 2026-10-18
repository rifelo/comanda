import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MotivoMerma } from "./mermas";

export interface MermaRow {
  id: string;
  kind: "producto" | "insumo";
  nombre: string;
  qty: number;
  unidad: string;
  motivo: MotivoMerma;
  justificacion: string;
  costo: number;
  reportedAt: string;
  reportedBy: string | null;
}

/** Mermas since `desde` (ISO), newest first. Works with the admin client (tablet) or the owner's session. */
export async function listMermas(db: SupabaseClient, orgId: string, desde: string, limit = 300): Promise<MermaRow[]> {
  const { data, error } = await db
    .from("inventario_mermas")
    .select("id, producto_id, nombre, qty, unidad, motivo, justificacion, costo_cop, reported_at, reporter:profiles!inventario_mermas_reported_by_fkey(full_name)")
    .eq("organization_id", orgId)
    .gte("reported_at", desde)
    .order("reported_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[listMermas]", error);
    return [];
  }
  return (data ?? []).map((r) => {
    const rep = (Array.isArray(r.reporter) ? r.reporter[0] : r.reporter) as { full_name: string | null } | null;
    return {
      id: r.id as string,
      kind: r.producto_id ? "producto" : "insumo",
      nombre: r.nombre as string,
      qty: Number(r.qty),
      unidad: r.unidad as string,
      motivo: r.motivo as MotivoMerma,
      justificacion: r.justificacion as string,
      costo: Number(r.costo_cop ?? 0),
      reportedAt: r.reported_at as string,
      reportedBy: rep?.full_name ?? null,
    };
  });
}

/** Start of the Bogotá day `daysBack` days ago (UTC-5, no DST), as ISO. */
export function inicioDia(today: string, daysBack = 0): string {
  const d = new Date(`${today}T05:00:00Z`);
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d.toISOString();
}
