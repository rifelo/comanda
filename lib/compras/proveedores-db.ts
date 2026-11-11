import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MedioPago } from "./pagos";
import type { CompraResumible } from "./proveedores";

// DB reads for the Proveedores tab (/inventario/proveedores). RLS client,
// filtered by organization by hand like the rest of lib/compras.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;

export interface ProveedorFicha {
  id: string;
  name: string;
  /** Digits only, with country code. */
  whatsapp: string | null;
  /** Old free-text order days («lunes y jueves»), from before the day chips. */
  dias_pedido: string | null;
  /** lun = 0 … dom = 6; empty = any day. */
  dias_pedido_idx: number[];
  entrega_dias: number;
  notas: string | null;
}

/** An inventory item as the supplier screens show it. */
export interface ItemProveedor {
  id: string;
  name: string;
  unit: string;
  pack_label: string | null;
  pack_qty: number | null;
  pieza_qty: number | null;
  stock_current: number;
  stock_min: number;
  stock_critico: number;
  proveedor_id: string | null;
}

export interface CompraDeProveedor extends CompraResumible {
  proveedor_id: string | null;
}

const PROV_COLS = "id, name, whatsapp, dias_pedido, dias_pedido_idx, entrega_dias, notas";
const ITEM_COLS = "id, name, unit, pack_label, pack_qty, pieza_qty, stock_current, stock_min, stock_critico, proveedor_id";

const ficha = (p: Record<string, unknown>): ProveedorFicha => ({
  id: p.id as string,
  name: p.name as string,
  whatsapp: (p.whatsapp as string | null) ?? null,
  dias_pedido: (p.dias_pedido as string | null) ?? null,
  dias_pedido_idx: ((p.dias_pedido_idx as number[] | null) ?? []).map(Number),
  entrega_dias: Number(p.entrega_dias ?? 1),
  notas: (p.notas as string | null) ?? null,
});

const item = (r: Record<string, unknown>): ItemProveedor => ({
  id: r.id as string,
  name: r.name as string,
  unit: r.unit as string,
  pack_label: (r.pack_label as string | null) ?? null,
  pack_qty: r.pack_qty == null ? null : Number(r.pack_qty),
  pieza_qty: r.pieza_qty == null ? null : Number(r.pieza_qty),
  stock_current: Number(r.stock_current ?? 0),
  stock_min: Number(r.stock_min ?? 0),
  stock_critico: Number(r.stock_critico ?? 0),
  proveedor_id: (r.proveedor_id as string | null) ?? null,
});

/** Active suppliers, A→Z. */
export async function listProveedoresFicha(db: Db, orgId: string): Promise<ProveedorFicha[]> {
  const { data } = await db.from("proveedores").select(PROV_COLS).eq("organization_id", orgId).eq("archived", false).order("name");
  return (data ?? []).map((p) => ficha(p as Record<string, unknown>));
}

/** One active supplier, or null when it doesn't exist / was archived. */
export async function getProveedorFicha(db: Db, orgId: string, id: string): Promise<ProveedorFicha | null> {
  const { data } = await db.from("proveedores").select(PROV_COLS).eq("organization_id", orgId).eq("id", id).eq("archived", false).maybeSingle();
  return data ? ficha(data as Record<string, unknown>) : null;
}

/** Every active inventory item (with its supplier), A→Z. */
export async function listItemsProveedor(db: Db, orgId: string): Promise<ItemProveedor[]> {
  const { data } = await db.from("ingredientes").select(ITEM_COLS).eq("organization_id", orgId).eq("archived", false).order("name");
  return (data ?? []).map((r) => item(r as Record<string, unknown>));
}

/** Orders with a supplier and their payments: enough to summarise each one. */
export async function listComprasResumen(db: Db, orgId: string): Promise<CompraDeProveedor[]> {
  const { data, error } = await db
    .from("compras")
    .select("proveedor_id, status, pedido_at, total_cop, factura_total_cop, compra_pagos(monto_cop, medio)")
    .eq("organization_id", orgId)
    .not("proveedor_id", "is", null)
    .order("pedido_at", { ascending: false })
    .limit(2000);
  if (error) {
    console.error("[listComprasResumen]", error);
    return [];
  }
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      proveedor_id: (row.proveedor_id as string | null) ?? null,
      status: row.status as CompraResumible["status"],
      pedido_at: row.pedido_at as string,
      total_cop: row.total_cop == null ? null : Number(row.total_cop),
      factura_total_cop: row.factura_total_cop == null ? null : Number(row.factura_total_cop),
      pagos: ((row.compra_pagos ?? []) as Array<Record<string, unknown>>).map((p) => ({ monto: Number(p.monto_cop), medio: p.medio as MedioPago })),
    };
  });
}
