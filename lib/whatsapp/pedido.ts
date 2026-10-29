import type { SupabaseClient } from "@supabase/supabase-js";
import type { PosCatalog } from "@/lib/pos/types";
import { itemRows, priceLines, type OrderLineInput, type PricedItem } from "@/lib/pos/lineas";

/**
 * A WhatsApp order as the agent hands it over, checked against the live
 * catalog before anything is written. The agent only proposes; this decides.
 */
export interface PedidoAgente {
  tipo: "llevar" | "domicilio";
  nombre: string;
  direccion: string | null;
  nota: string | null;
  lineas: { productoId: string; cantidad: number; opciones: { grupoId: string; opcion: string }[] }[];
}

export type PedidoValidado =
  | { ok: true; lines: OrderLineInput[]; items: PricedItem[]; subtotal: number }
  | { ok: false; error: string };

/**
 * Every problem is phrased for the agent to fix with the customer: an unknown
 * or sold-out product, an option the product doesn't take, a required choice
 * left out, a delivery without an address.
 */
export function validarPedido(catalog: PosCatalog, p: PedidoAgente): PedidoValidado {
  if (!p.lineas.length) return { ok: false, error: "El pedido no tiene productos." };
  if (!p.nombre.trim()) return { ok: false, error: "Falta el nombre del cliente." };
  if (p.tipo === "domicilio" && !(p.direccion ?? "").trim()) {
    return { ok: false, error: "Es domicilio y falta la dirección de entrega." };
  }
  const lines: OrderLineInput[] = [];
  for (const l of p.lineas) {
    const prod = catalog.byId[l.productoId];
    if (!prod) return { ok: false, error: `El producto ${l.productoId} no existe en el menú.` };
    if (prod.stock === "sin") return { ok: false, error: `${prod.name} está agotado hoy.` };
    if (!Number.isInteger(l.cantidad) || l.cantidad < 1 || l.cantidad > 20) {
      return { ok: false, error: `Cantidad inválida para ${prod.name}.` };
    }
    const mods: Record<string, string | string[]> = {};
    for (const o of l.opciones) {
      const g = catalog.modGroups[o.grupoId];
      if (!g || !prod.mods.includes(o.grupoId)) {
        return { ok: false, error: `${prod.name} no tiene la opción «${o.opcion}».` };
      }
      if (!g.options.some((x) => x.name === o.opcion)) {
        return { ok: false, error: `«${o.opcion}» no es una opción de ${g.name} para ${prod.name}.` };
      }
      if (g.type === "multi") mods[g.id] = [...((mods[g.id] as string[] | undefined) ?? []), o.opcion];
      else mods[g.id] = o.opcion;
    }
    for (const gid of prod.mods) {
      const g = catalog.modGroups[gid];
      if (g?.required && !mods[gid]) return { ok: false, error: `Falta elegir ${g.name} para ${prod.name}.` };
    }
    lines.push({ kind: "item", id: prod.id, qty: l.cantidad, mods });
  }
  const priced = priceLines(catalog, lines);
  if (!priced.ok) return priced;
  return { ok: true, lines, items: priced.items, subtotal: priced.subtotal };
}

/** The ticket note the register shows: who, how to reach them, where it goes. */
export function notaPedido(p: PedidoAgente, telefono: string): string {
  return [
    `WhatsApp +${telefono}`,
    p.tipo === "domicilio" ? `Domicilio: ${p.direccion!.trim()}` : "Para llevar",
    p.nota?.trim() || null,
  ].filter(Boolean).join(" · ");
}

/**
 * Save the order as pending in the register (folio from the same sequence the
 * POS uses), with the WhatsApp channel, phone and delivery address.
 */
export async function guardarPedidoWhatsapp(
  db: SupabaseClient,
  ctx: { organizationId: string; restaurantId: string; telefono: string },
  p: PedidoAgente,
  v: Extract<PedidoValidado, { ok: true }>,
): Promise<{ ok: true; ordenId: string; folio: string } | { ok: false; error: string }> {
  const { organizationId: orgId } = ctx;
  const { data: seq, error: seqErr } = await db.rpc("next_orden_folio", { p_org: orgId });
  if (seqErr) {
    console.error("[guardarPedidoWhatsapp] folio:", seqErr);
    return { ok: false, error: "No se pudo generar el número de pedido." };
  }
  const folio = `A-${seq}`;
  const { data: orden, error } = await db
    .from("ordenes")
    .insert({
      organization_id: orgId,
      restaurant_id: ctx.restaurantId,
      folio,
      order_type: p.tipo,
      status: "pendiente",
      subtotal_cop: v.subtotal,
      total_cop: v.subtotal,
      sin_gluten: false,
      notes: notaPedido(p, ctx.telefono),
      customer_name: p.nombre.trim().slice(0, 80),
      customer_names: [],
      canal: "whatsapp",
      customer_phone: ctx.telefono,
      delivery_address: p.tipo === "domicilio" ? p.direccion!.trim() : null,
    })
    .select("id")
    .single();
  if (error || !orden) {
    console.error("[guardarPedidoWhatsapp] orden:", error);
    return { ok: false, error: "No se pudo guardar el pedido." };
  }
  const { error: itemsErr } = await db.from("orden_items").insert(itemRows(orgId, orden.id as string, v.items));
  if (itemsErr) {
    await db.from("ordenes").delete().eq("id", orden.id).eq("organization_id", orgId);
    console.error("[guardarPedidoWhatsapp] items:", itemsErr);
    return { ok: false, error: "No se pudieron guardar los productos." };
  }
  return { ok: true, ordenId: orden.id as string, folio };
}
