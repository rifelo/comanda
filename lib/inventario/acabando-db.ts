import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listFaltantesAbiertos } from "./faltantes-db";
import type { EnCamino, InsumoBase, NuevoPendiente, ReporteAbierto } from "./acabando";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;

export interface AcabandoData {
  items: InsumoBase[];
  abiertos: ReporteAbierto[];
  camino: EnCamino[];
  nuevos: NuevoPendiente[];
}

const one = <T,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as T | null;

/**
 * Everything «¿Qué se está acabando?» shows, read once with the service role
 * (the tablet): the list, its open marks, what is in an open order and what
 * the team added that the owner has not looked at yet.
 */
export async function loadAcabando(db: Db, orgId: string): Promise<AcabandoData> {
  const [{ data: ings }, abiertos, { data: camino }, { data: nuevos }] = await Promise.all([
    db.from("ingredientes").select("id, name, unit, ubicacion, pack_label, pieza_qty").eq("organization_id", orgId).eq("archived", false).order("name"),
    listFaltantesAbiertos(db, orgId),
    db
      .from("compra_items")
      .select("ingrediente_id, compra:compras!inner(status, entrega_esperada, proveedor:proveedores(name))")
      .eq("organization_id", orgId)
      .eq("compra.status", "pedido")
      .not("ingrediente_id", "is", null),
    db
      .from("inventario_sugerencias")
      .select("id, nombre, zona, estado, nota, created_at, who:profiles!inventario_sugerencias_sugerido_por_fkey(full_name)")
      .eq("organization_id", orgId)
      .eq("tipo", "nuevo")
      .eq("status", "pendiente")
      .order("created_at"),
  ]);
  return {
    items: (ings ?? []).map((i) => ({
      id: i.id as string,
      name: i.name as string,
      unit: i.unit as string,
      ubicacion: (i.ubicacion as string | null) ?? null,
      pack_label: (i.pack_label as string | null) ?? null,
      pieza_qty: i.pieza_qty === null || i.pieza_qty === undefined ? null : Number(i.pieza_qty),
    })),
    abiertos: abiertos.map((a) => ({ ingrediente_id: a.ingrediente_id, estado: a.estado, reported_at: a.reported_at, reported_by_name: a.reported_by_name, note: a.note })),
    camino: (camino ?? []).map((c) => {
      const compra = one<{ entrega_esperada: string | null; proveedor: unknown }>(c.compra);
      return {
        ingrediente_id: c.ingrediente_id as string,
        proveedor: one<{ name: string }>(compra?.proveedor)?.name ?? null,
        entrega_esperada: compra?.entrega_esperada ?? null,
      };
    }),
    nuevos: (nuevos ?? []).map((n) => ({
      id: n.id as string,
      nombre: n.nombre as string,
      zona: n.zona as string,
      estado: (n.estado as "bajo" | "agotado" | null) ?? null,
      nota: (n.nota as string | null) ?? null,
      by: one<{ full_name: string | null }>(n.who)?.full_name ?? null,
      at: n.created_at as string,
    })),
  };
}
