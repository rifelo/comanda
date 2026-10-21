import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CalificacionBarista, OrdenBarista } from "./baristas";

// Reads for the Baristas report (owner panel, RLS client). Days are Bogotá
// calendar days (fixed UTC-5, no DST).

const desdeIso = (dia: string) => `${dia}T00:00:00-05:00`;
const hastaIso = (dia: string) => {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return `${d.toISOString().slice(0, 10)}T00:00:00-05:00`;
};

/** Orders of the period that count (not cancelled, not folded into another), with their lines. */
export async function ordenesDelPeriodo(db: SupabaseClient, orgId: string, desde: string, hasta: string): Promise<OrdenBarista[]> {
  const { data, error } = await db
    .from("ordenes")
    .select("id, barista_id, orden_items(producto_id, combo_id, qty)")
    .eq("organization_id", orgId)
    .neq("status", "cancelada")
    .is("merged_into", null)
    .gte("created_at", desdeIso(desde))
    .lt("created_at", hastaIso(hasta))
    .limit(10000);
  if (error) {
    console.error("[ordenesDelPeriodo]", error);
    return [];
  }
  return (data ?? []).map((o) => ({
    id: o.id as string,
    baristaId: (o.barista_id as string | null) ?? null,
    items: ((o.orden_items as { producto_id: string | null; combo_id: string | null; qty: number }[] | null) ?? []).map((i) => ({
      productoId: i.producto_id,
      comboId: i.combo_id,
      qty: Number(i.qty),
    })),
  }));
}

export interface CalificacionDetalle extends CalificacionBarista {
  id: string;
  usadaAt: string;
  sugerencia: string | null;
  customerName: string | null;
  folio: string | null;
  bebida: string;
  baristaId: string | null;
}

/** Ratings answered for orders of the period, newest first. */
export async function calificacionesDelPeriodo(db: SupabaseClient, orgId: string, desde: string, hasta: string): Promise<CalificacionDetalle[]> {
  const { data, error } = await db
    .from("calificaciones")
    .select("id, orden_id, usada_at, estrellas, sugerencia, customer_name, items, orden:ordenes!inner(folio, barista_id, created_at)")
    .eq("organization_id", orgId)
    .not("usada_at", "is", null)
    .gte("orden.created_at", desdeIso(desde))
    .lt("orden.created_at", hastaIso(hasta))
    .order("usada_at", { ascending: false })
    .limit(1000);
  if (error) {
    console.error("[calificacionesDelPeriodo]", error);
    return [];
  }
  return (data ?? []).map((r) => {
    const orden = (Array.isArray(r.orden) ? r.orden[0] : r.orden) as { folio: string; barista_id: string | null } | null;
    const items = (r.items as { qty: number; name: string }[] | null) ?? [];
    return {
      id: r.id as string,
      ordenId: r.orden_id as string,
      estrellas: Number(r.estrellas),
      usadaAt: r.usada_at as string,
      sugerencia: (r.sugerencia as string | null) ?? null,
      customerName: (r.customer_name as string | null) ?? null,
      folio: orden?.folio ?? null,
      bebida: items.map((i) => (i.qty > 1 ? `${i.qty} × ${i.name}` : i.name)).join(" · ") || "Bebida",
      baristaId: orden?.barista_id ?? null,
    };
  });
}

/** Display names for the baristas found in the period (incl. people no longer on the team). */
export async function nombresBaristas(db: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const { data } = await db.from("profiles").select("id, full_name").in("id", ids);
  return new Map((data ?? []).map((p) => [p.id as string, ((p.full_name as string | null) ?? "").trim() || "Sin nombre"]));
}
