import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PosCatalog, ModSelection } from "./types";
import { aplicarDescuentos, etiquetaDescuento, lineasDeOrden, type DescuentoRegla, type OrderDescuento, type DescuentoEstado } from "./descuentos";

/**
 * Descuentos (mig 0085), database side. Every approved rule of an order is
 * re-applied from the list prices whenever the order changes (approval, edit,
 * combine), so a discount never compounds on itself.
 */

type Row = { tipo: "precio" | "porcentaje"; producto_id: string | null; precio_cop: number | null; porcentaje: number | string | null };

export function reglaDe(r: Row): DescuentoRegla {
  return r.tipo === "precio"
    ? { tipo: "precio", productoId: r.producto_id as string, precio: Number(r.precio_cop ?? 0) }
    : { tipo: "porcentaje", porcentaje: Number(r.porcentaje ?? 0) };
}

/** Approved rules of an order, oldest → newest. */
export async function reglasAprobadas(db: SupabaseClient, orgId: string, ordenId: string): Promise<DescuentoRegla[]> {
  const { data } = await db
    .from("orden_descuentos")
    .select("tipo, producto_id, precio_cop, porcentaje")
    .eq("organization_id", orgId)
    .eq("orden_id", ordenId)
    .eq("estado", "aprobado")
    .order("resuelto_at", { ascending: true });
  return ((data ?? []) as Row[]).map(reglaDe);
}

type ItemRow = { id: string; kind: "item" | "combo"; producto_id: string | null; combo_id: string | null; qty: number; unit_price_cop: number; mods: ModSelection | null };

/** Price a stored order's lines with `reglas` (no writes). */
export async function calcularOrden(db: SupabaseClient, orgId: string, ordenId: string, catalog: PosCatalog, reglas: DescuentoRegla[]) {
  const [{ data: orden }, { data: items }] = await Promise.all([
    db.from("ordenes").select("id, folio, status, total_cop, paid_cop").eq("organization_id", orgId).eq("id", ordenId).maybeSingle(),
    db.from("orden_items").select("id, kind, producto_id, combo_id, qty, unit_price_cop, mods").eq("organization_id", orgId).eq("orden_id", ordenId).order("position"),
  ]);
  if (!orden) return null;
  const rows = (items ?? []) as ItemRow[];
  const lineas = lineasDeOrden(
    catalog,
    rows.map((r) => ({ kind: r.kind, productoId: r.producto_id, comboId: r.combo_id, qty: Number(r.qty), unitPrice: Number(r.unit_price_cop), mods: r.mods ?? {} })),
  );
  return { orden, rows, ...aplicarDescuentos(lineas, reglas) };
}

/**
 * Re-price a pending order with its approved rules (+ `extra`, the one being
 * approved): updates the lines whose unit changed and the order's subtotal /
 * total / descuento. Refuses when more was already paid than the new total.
 */
export async function repricearOrden(
  db: SupabaseClient,
  orgId: string,
  ordenId: string,
  catalog: PosCatalog,
  extra?: DescuentoRegla,
): Promise<{ ok: true; antes: number; total: number } | { ok: false; error: string }> {
  const reglas = await reglasAprobadas(db, orgId, ordenId);
  const calc = await calcularOrden(db, orgId, ordenId, catalog, extra ? [...reglas, extra] : reglas);
  if (!calc) return { ok: false, error: "El pedido ya no existe." };
  if (calc.orden.status !== "pendiente") return { ok: false, error: "El pedido ya fue cobrado o cancelado." };
  if (Number(calc.orden.paid_cop ?? 0) > calc.total) return { ok: false, error: "Ya se cobró más de lo que quedaría con el descuento." };
  for (const [i, r] of calc.rows.entries()) {
    if (Number(r.unit_price_cop) === calc.units[i]) continue;
    const { error } = await db.from("orden_items").update({ unit_price_cop: calc.units[i] }).eq("id", r.id).eq("organization_id", orgId);
    if (error) {
      console.error("[repricearOrden] item", error);
      return { ok: false, error: "No se pudo actualizar el pedido." };
    }
  }
  const { error } = await db
    .from("ordenes")
    .update({ subtotal_cop: calc.subtotal, total_cop: calc.total, descuento_cop: calc.descuento })
    .eq("id", ordenId)
    .eq("organization_id", orgId)
    .eq("status", "pendiente");
  if (error) {
    console.error("[repricearOrden] orden", error);
    return { ok: false, error: "No se pudo actualizar el pedido." };
  }
  return { ok: true, antes: Number(calc.orden.total_cop), total: calc.total };
}

/** Pending + approved discounts of the listed orders, for the register's cards. */
export async function descuentosDeOrdenes(db: SupabaseClient, orgId: string, ids: string[]): Promise<Map<string, OrderDescuento[]>> {
  const out = new Map<string, OrderDescuento[]>();
  if (!ids.length) return out;
  const { data } = await db
    .from("orden_descuentos")
    .select("id, orden_id, tipo, producto_nombre, precio_cop, porcentaje, estado, motivo, pedido_at")
    .eq("organization_id", orgId)
    .in("orden_id", ids)
    .in("estado", ["pendiente", "aprobado", "rechazado"])
    .order("pedido_at", { ascending: true });
  for (const d of data ?? []) {
    const list = out.get(d.orden_id as string) ?? [];
    list.push({
      id: d.id as string,
      estado: d.estado as DescuentoEstado,
      label: etiquetaDescuento(d as Parameters<typeof etiquetaDescuento>[0]),
      motivo: d.motivo as string,
    });
    out.set(d.orden_id as string, list);
  }
  return out;
}
