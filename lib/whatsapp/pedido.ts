import type { SupabaseClient } from "@supabase/supabase-js";
import type { PosCatalog } from "@/lib/pos/types";
import { bolsasDomicilio, EMPAQUE_DOMICILIO_SKU } from "@/lib/pos/empaque";
import { itemRows, priceLines, type OrderLineInput, type PricedItem } from "@/lib/pos/lineas";

/**
 * A WhatsApp order as the agent hands it over, checked against the live
 * catalog before anything is written. The agent only proposes; this decides.
 */
export interface PedidoAgente {
  /** «cercano» = a free nearby delivery point; the team walks it over. */
  tipo: "llevar" | "domicilio" | "cercano";
  nombre: string;
  direccion: string | null;
  /** Phone of whoever receives a delivery (digits); null for pick-up. */
  telefono: string | null;
  nota: string | null;
  lineas: {
    productoId: string;
    cantidad: number;
    opciones: { grupoId: string; opcion: string }[];
    /** Whose cup it is (the name on its label) when the order is for several people; null = the customer. */
    para?: string | null;
  }[];
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
  if (p.tipo === "cercano" && !(p.direccion ?? "").trim()) {
    return { ok: false, error: "Es una entrega cercana y falta cuál punto (p. ej. la droguería)." };
  }
  const tel = (p.telefono ?? "").replace(/\D/g, "");
  if (p.tipo === "domicilio" && (tel.length < 7 || tel.length > 13)) {
    return { ok: false, error: "Es domicilio y falta el teléfono de quien recibe." };
  }
  // The delivery packaging is ours to add: one line per bag (up to 4 drinks each).
  const empaque = catalog.menu.find((x) => x.sku === EMPAQUE_DOMICILIO_SKU) ?? null;
  const lines: OrderLineInput[] = [];
  let bebidas = 0;
  for (const l of p.lineas) {
    if (empaque && l.productoId === empaque.id) continue;
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
    const para = (l.para ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
    lines.push({ kind: "item", id: prod.id, qty: l.cantidad, mods, ...(para ? { customer: para } : {}) });
    if (prod.empaque === "bebida") bebidas += l.cantidad;
  }
  if (!lines.length) return { ok: false, error: "El pedido no tiene productos." };
  const bolsas = p.tipo === "domicilio" && empaque ? bolsasDomicilio(bebidas) : 0;
  if (bolsas > 0) lines.push({ kind: "item", id: empaque!.id, qty: bolsas, mods: {} });
  const priced = priceLines(catalog, lines);
  if (!priced.ok) return priced;
  return { ok: true, lines, items: priced.items, subtotal: priced.subtotal };
}

/** The people of a multi-person order, in order of appearance (the POS's «people» chips → one label name per cup). */
export function personasDelPedido(lines: ReadonlyArray<OrderLineInput>): string[] {
  const out: string[] = [];
  for (const l of lines) {
    const n = l.customer?.trim();
    if (n && !out.some((x) => x.toLocaleLowerCase() === n.toLocaleLowerCase())) out.push(n);
  }
  return out;
}

/** The ticket note the register shows: who, how to reach them, where it goes. */
export function notaPedido(p: PedidoAgente, telefono: string): string {
  return [
    `WhatsApp +${telefono}`,
    p.tipo === "domicilio"
      ? `Domicilio: ${p.direccion!.trim()} · Recibe ${p.nombre.trim()}, tel ${(p.telefono ?? "").replace(/\D/g, "")}`
      : p.tipo === "cercano"
        ? `Se lo llevamos a ${p.direccion!.trim()} (entrega cercana gratis)`
        : "Para llevar",
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
      // A nearby point is a pick-up the barista walks over («Se lo llevamos»).
      order_type: p.tipo === "cercano" ? "llevar" : p.tipo,
      se_lo_llevamos: p.tipo === "cercano",
      status: "pendiente",
      subtotal_cop: v.subtotal,
      total_cop: v.subtotal,
      sin_gluten: false,
      notes: notaPedido(p, ctx.telefono),
      customer_name: p.nombre.trim().slice(0, 80),
      customer_names: personasDelPedido(v.lines),
      canal: "whatsapp",
      wa_estado: "por_aceptar",
      customer_phone: ctx.telefono,
      delivery_address: p.tipo === "llevar" ? null : p.direccion!.trim(),
      telefono_recibe: p.tipo === "domicilio" ? (p.telefono ?? "").replace(/\D/g, "") || null : null,
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

export type ModificarResultado =
  | { ok: true; ordenId: string; folio: string }
  | { ok: false; error: string };

/**
 * The customer changes an order the bar hasn't accepted yet (another product,
 * pick-up → portería, a different name on a cup): the order keeps its number
 * and is rewritten whole. Only this customer's WhatsApp orders still
 * «por aceptar»; once the bar took it, the change goes to a person.
 */
export async function modificarPedidoWhatsapp(
  db: SupabaseClient,
  ctx: { organizationId: string; telefono: string },
  folio: string,
  p: PedidoAgente,
  v: Extract<PedidoValidado, { ok: true }>,
): Promise<ModificarResultado> {
  const { organizationId: orgId } = ctx;
  const numero = folio.trim().toUpperCase().replace(/^(?:A-?)?/, "A-");
  const { data: orden } = await db
    .from("ordenes")
    .select("id, folio, status, wa_estado")
    .eq("organization_id", orgId)
    .eq("canal", "whatsapp")
    .eq("customer_phone", ctx.telefono)
    .eq("folio", numero)
    .maybeSingle();
  if (!orden) return { ok: false, error: `No encontré el pedido ${numero} de este cliente. Revisa el número en sus últimos pedidos.` };
  if (orden.status !== "pendiente" || orden.wa_estado !== "por_aceptar") {
    return {
      ok: false,
      error: `El pedido ${numero} ya fue aceptado por el equipo y no se puede cambiar desde aquí. Usa pasar_a_humano con el cambio exacto que pide el cliente y contesta «Ok entendido, ya lo revisamos».`,
    };
  }
  const ordenId = orden.id as string;
  // Claim the order first: if the bar accepts it at this same moment, nothing changes.
  const { data: tomado, error: updErr } = await db
    .from("ordenes")
    .update({
      order_type: p.tipo === "cercano" ? "llevar" : p.tipo,
      se_lo_llevamos: p.tipo === "cercano",
      subtotal_cop: v.subtotal,
      total_cop: v.subtotal,
      notes: `Modificado por el cliente · ${notaPedido(p, ctx.telefono)}`,
      customer_name: p.nombre.trim().slice(0, 80),
      customer_names: personasDelPedido(v.lines),
      delivery_address: p.tipo === "llevar" ? null : p.direccion!.trim(),
      telefono_recibe: p.tipo === "domicilio" ? (p.telefono ?? "").replace(/\D/g, "") || null : null,
    })
    .eq("id", ordenId)
    .eq("organization_id", orgId)
    .eq("status", "pendiente")
    .eq("wa_estado", "por_aceptar")
    .select("id");
  if (updErr || !tomado?.length) {
    if (updErr) console.error("[modificarPedidoWhatsapp] orden:", updErr);
    return { ok: false, error: `El pedido ${numero} acaba de ser aceptado por el equipo. Usa pasar_a_humano con el cambio exacto y contesta «Ok entendido, ya lo revisamos».` };
  }
  const { data: viejos } = await db.from("orden_items").select("id").eq("orden_id", ordenId).eq("organization_id", orgId);
  // New lines first, so a failure never leaves the order empty.
  const { error: insErr } = await db.from("orden_items").insert(itemRows(orgId, ordenId, v.items));
  if (insErr) {
    console.error("[modificarPedidoWhatsapp] items:", insErr);
    return { ok: false, error: "No se pudieron guardar los productos nuevos. Usa pasar_a_humano con el cambio." };
  }
  const ids = ((viejos ?? []) as { id: string }[]).map((r) => r.id);
  if (ids.length) {
    const { error: delErr } = await db.from("orden_items").delete().in("id", ids).eq("organization_id", orgId);
    if (delErr) console.error("[modificarPedidoWhatsapp] borrar items:", delErr);
  }
  return { ok: true, ordenId, folio: numero };
}
