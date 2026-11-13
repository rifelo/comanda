"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requirePosContext, requirePosAuth, type PosAuth } from "@/lib/pos/server";
import { parseCreadoPor, pickBarista, pickCreatedBy, resolvePersonInOrg } from "@/lib/auth-person";
import { registrarEnlaces, reubicarEnlaces } from "@/lib/calificaciones/calificaciones-db";
import { registerPosDevice, unlinkCurrentPosDevice } from "@/lib/pos/devices";
import { suggestPosActions, MissingApiKeyError } from "@/lib/ai/pos-assistant";
import { generarFraseCafe } from "@/lib/ai/frase";
import { MissingGroqKeyError, GroqRateLimitError } from "@/lib/ai/groq";
import { FRASE_TONO_IDS, fraseBebida, type FraseCategoria, type FraseTono } from "@/lib/pos/frase";
import { LabelSpecSchema, RELAY_BATCH_MAX, RELAY_TTL_MS, type LabelSpec } from "@/lib/printer/spec";
import { TicketDocSchema, type TicketDoc } from "@/lib/printer/ticket";
import { ESTACION_VIVA_MS, LatidoSchema, type EstadoImpresoras, type Latido, type TicketEstacion } from "@/lib/printer/estaciones";
import { transcribeSegment, MissingSttKeyError, RateLimitError } from "@/lib/ai/transcribe";
import type {
  PosCatalog,
  PosSuggest,
  PosAct,
  PosCatalogFilter,
  PendingOrder,
  PosOrder,
  OrderPayment,
  PayMethodId,
  ModSelection,
} from "@/lib/pos/types";
import { bogotaDay, shiftDay } from "@/lib/pos/pending";
import { cancelNotes, summarizeMethod } from "@/lib/pos/pagos";
import { syncOrderConsumption } from "@/lib/pos/stock";
import { LineSchema, itemRows, priceLines, type PricedItem } from "@/lib/pos/lineas";
import { aplicarDescuentos, etiquetaDescuento, type DescuentoRegla } from "@/lib/pos/descuentos";
import { calcularOrden, descuentosDeOrdenes, reglasAprobadas, repricearOrden } from "@/lib/pos/descuentos-db";
import { resumirVentas, ventanaVentas, type ResumenVentas, type VentaOrden } from "@/lib/pos/ventas";

// ── payloads (lines are re-priced in lib/pos/lineas.ts, never trusted) ──────
const PaymentSchema = z.object({
  // «tarjeta» was the datáfono before 0063; an order queued offline on an
  // older register may still carry it.
  method: z.enum(["efectivo", "transferencia", "datafono", "tarjeta"]).transform((m) => (m === "tarjeta" ? "datafono" : m)),
  /** Cash received; only meaningful for efectivo. */
  tendered: z.coerce.number().int().min(0).max(100_000_000).nullable().optional(),
  /** Approval number from the datáfono voucher (optional, datafono only). */
  approvalCode: z.string().trim().max(40).nullable().optional(),
});
const CrearOrdenSchema = z.object({
  orderType: z.enum(["aqui", "llevar", "domicilio"]),
  sinGluten: z.boolean(),
  lines: z.array(LineSchema).min(1).max(60),
  payment: PaymentSchema.optional(),
  /** Who the order is for (self-service: by name, no tables). */
  customerName: z.string().trim().max(80).optional(),
  /** The barista brings it to the customer («Se lo llevamos»). */
  seLoLlevamos: z.boolean().optional(),
  /** Ordered roster of the order; keeps people who have no line yet. */
  customerNames: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  note: z.string().trim().max(500).optional(),
  /** Id the register gave the order; a retry with the same ref returns the stored order. */
  clientRef: z.string().trim().min(8).max(64).optional(),
  /** Who is on the bar («Barista: …» in the POS); kept only if they're on the team. */
  baristaId: z.string().uuid().optional(),
  /** When the cashier confirmed it (ms) — an order queued offline keeps its real time. */
  createdAt: z.number().int().positive().optional(),
  /**
   * Person in session when the sale was confirmed. Only used when the device
   * has nobody in session by the time it lands (offline replay), and only if
   * they are a member of the device's org — see `orderAttribution`.
   */
  creadoPor: z.string().uuid().optional(),
});

/** The confirm time of a queued order, if believable (last 3 days, not in the future); else now. */
function orderTime(createdAt: number | undefined): string {
  const now = Date.now();
  if (createdAt && createdAt <= now + 2 * 60_000 && createdAt >= now - 3 * 86_400_000) {
    return new Date(Math.min(createdAt, now)).toISOString();
  }
  return new Date(now).toISOString();
}

export type CrearOrdenResult =
  | { ok: true; folio: string; ordenId: string; total: number; change: number }
  | { ok: false; error: string };

type OrdenBase = Omit<z.infer<typeof CrearOrdenSchema>, "payment">;
type PosCtx = Awaited<ReturnType<typeof requirePosContext>>;

/**
 * Tender: change is computed here from the recomputed total, never trusted
 * from the client. Cash short of the total is rejected.
 */
function settleTender(
  payment: z.infer<typeof PaymentSchema>,
  total: number,
): { ok: true; tendered: number | null; change: number } | { ok: false; error: string } {
  const tendered = payment.method === "efectivo" ? payment.tendered ?? total : null;
  if (tendered !== null && tendered < total) {
    return { ok: false, error: "El efectivo recibido es menor que el total." };
  }
  return { ok: true, tendered, change: tendered !== null ? tendered - total : 0 };
}

/** Profile behind the sale for the movement log: the account, or the person on the paired device. */
function actorId(ctx: Pick<PosAuth, "actor">): string | null {
  return ctx.actor.kind === "user" ? ctx.actor.profileId : (ctx.actor.person?.profileId ?? null);
}

/**
 * `created_by` + `barista_id` of a new order. The org-membership lookup for
 * `creadoPor` runs only when it can matter: a paired device with nobody in
 * session (an offline sale replayed after the session expired).
 */
async function orderAttribution(ctx: PosCtx, data: OrdenBase): Promise<{ created_by: string | null; barista_id: string | null }> {
  const { actor } = ctx;
  const creadoPor = parseCreadoPor(data.creadoPor);
  const needsCheck = actor.kind === "device" && !actor.person && !!creadoPor;
  const isMember = needsCheck ? !!(await resolvePersonInOrg(ctx.supabase, creadoPor!, ctx.organizationId)) : false;
  const created_by = pickCreatedBy(actor, creadoPor, isMember);
  return { created_by, barista_id: pickBarista(data.baristaId, created_by, ctx.catalog.equipo) };
}

type OrdenHeader = {
  status: "pagada" | "pendiente";
  payment_method: z.infer<typeof PaymentSchema>["method"] | null;
  tendered_cop: number | null;
  change_cop: number;
  paid_at: string | null;
  paid_cop?: number;
  por_verificar?: "transferencia" | null;
};

/** Allocate a folio and insert header + lines (rolls the header back on item failure). */
async function insertOrden(
  ctx: PosCtx,
  data: OrdenBase,
  priced: { items: PricedItem[]; subtotal: number },
  header: OrdenHeader,
): Promise<{ ok: true; folio: string; ordenId: string; existing?: { status: string } } | { ok: false; error: string }> {
  const { supabase, organizationId: orgId, actor } = ctx;
  const restaurantId =
    actor.kind === "device" ? actor.device.restaurantId : actor.restaurantId;

  // The register retries a queued order until it hears back; one that already
  // landed (the answer was lost on the way) is returned instead of doubled.
  const findByRef = async () => {
    if (!data.clientRef) return null;
    const { data: hit } = await supabase
      .from("ordenes")
      .select("id, folio, status")
      .eq("organization_id", orgId)
      .eq("client_ref", data.clientRef)
      .maybeSingle();
    return hit ? { ok: true as const, folio: hit.folio as string, ordenId: hit.id as string, existing: { status: hit.status as string } } : null;
  };
  const prior = await findByRef();
  if (prior) return prior;
  const who = await orderAttribution(ctx, data);

  // Atomic per-org folio.
  const { data: seq, error: seqErr } = await supabase.rpc("next_orden_folio", {
    p_org: orgId,
  });
  if (seqErr) {
    console.error("[insertOrden] folio rpc failed:", seqErr);
    return { ok: false, error: "No se pudo generar el número de pedido." };
  }
  const folio = `A-${seq}`;

  const { data: orden, error: ordenErr } = await supabase
    .from("ordenes")
    .insert({
      organization_id: orgId,
      restaurant_id: restaurantId,
      folio,
      order_type: data.orderType,
      subtotal_cop: priced.subtotal,
      total_cop: priced.subtotal,
      sin_gluten: data.sinGluten,
      notes: data.note || null,
      customer_name: data.customerName || null,
      customer_names: data.customerNames ?? [],
      created_by: who.created_by,
      pos_device_id: actor.kind === "device" ? actor.device.id : null,
      client_ref: data.clientRef ?? null,
      barista_id: who.barista_id,
      se_lo_llevamos: data.seLoLlevamos ?? false,
      created_at: orderTime(data.createdAt),
      ...header,
    })
    .select("id")
    .single();
  if (ordenErr?.code === "23505") {
    const dup = await findByRef();
    if (dup) return dup;
  }
  if (ordenErr || !orden) {
    console.error("[insertOrden] insert orden failed:", ordenErr);
    return { ok: false, error: "No se pudo guardar el pedido." };
  }

  const { error: itemsErr } = await supabase
    .from("orden_items")
    .insert(itemRows(orgId, orden.id as string, priced.items));
  if (itemsErr) {
    // Roll back the header so we don't leave an empty order around.
    await supabase.from("ordenes").delete().eq("id", orden.id).eq("organization_id", orgId);
    console.error("[insertOrden] insert items failed:", itemsErr);
    return { ok: false, error: "No se pudieron guardar los productos." };
  }
  return { ok: true, folio, ordenId: orden.id as string };
}

/**
 * Persist a paid POS order ("Cobrar"). Prices are recomputed from the live
 * catalog — the client payload only carries ids/qty/mods, never trusted
 * money. Returns the human folio ("A-247") for the confirmation screen.
 */
export async function crearOrden(input: unknown): Promise<CrearOrdenResult> {
  const parsed = CrearOrdenSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pedido inválido." };
  const ctx = await requirePosContext();

  const priced = priceLines(ctx.catalog, parsed.data.lines);
  if (!priced.ok) return priced;
  const payment = parsed.data.payment ?? { method: "efectivo" as const, tendered: null };
  const tender = settleTender(payment, priced.subtotal);
  if (!tender.ok) return tender;

  const { payment: _p, ...base } = parsed.data;
  void _p;
  const ins = await insertOrden(ctx, base, priced, {
    status: "pagada",
    payment_method: payment.method,
    tendered_cop: tender.tendered,
    change_cop: tender.change,
    paid_at: orderTime(base.createdAt),
    // A datáfono voucher number lives on a payment row; the order is then
    // counted from its pagos, like a split one (paid_cop = the total).
    ...(payment.approvalCode && payment.method === "datafono" ? { paid_cop: priced.subtotal } : {}),
  });
  if (!ins.ok) return ins;
  if (!ins.existing && payment.approvalCode && payment.method === "datafono") {
    const { error: pagoErr } = await ctx.supabase.from("orden_pagos").insert({
      organization_id: ctx.organizationId,
      orden_id: ins.ordenId,
      customer_name: null,
      method: "datafono",
      amount_cop: priced.subtotal,
      tendered_cop: null,
      change_cop: 0,
      aprobacion: payment.approvalCode,
      created_by: actorId(ctx),
    });
    if (pagoErr) {
      // The sale stands; only the voucher number is lost (paid from the header).
      console.error("[crearOrden] voucher row failed:", pagoErr);
      await ctx.supabase.from("ordenes").update({ paid_cop: 0 }).eq("id", ins.ordenId).eq("organization_id", ctx.organizationId);
    }
  }
  if (ins.existing) {
    // Queued as «pagar después», then charged while still offline: the order
    // may have landed as pendiente on an attempt whose answer was lost.
    if (ins.existing.status === "pendiente") {
      const res = await applyPago(ctx, ins.ordenId, null, payment, undefined);
      if (!res.ok) return res;
      return { ok: true, folio: res.folio, ordenId: res.ordenId, total: res.total, change: res.change };
    }
    return { ok: true, folio: ins.folio, ordenId: ins.ordenId, total: priced.subtotal, change: tender.change };
  }
  // Inventory follows the sale; a stock problem is logged, never blocks the receipt.
  await syncOrderConsumption(ctx.supabase, ctx.organizationId, ins.ordenId, actorId(ctx));
  return { ok: true, folio: ins.folio, ordenId: ins.ordenId, total: priced.subtotal, change: tender.change };
}

// ── pending orders ("enviar · pagar después") ────────────────────────────────
const GuardarPendienteSchema = CrearOrdenSchema.omit({ payment: true }).extend({
  /** Present when re-saving an order that is already pending (edit). */
  ordenId: z.string().uuid().optional(),
  /** «Aún no llega · pagar después» on the transfer page. */
  porVerificar: z.literal("transferencia").nullable().optional(),
});
const CobrarPendienteSchema = z.object({
  ordenId: z.string().uuid(),
  payment: PaymentSchema,
});
const CancelarPendienteSchema = z.object({
  ordenId: z.string().uuid(),
  /** «<razón>: <detalle>» from the POS «Cancelar» overlay (CANCEL_REASONS + optional detail); prepended to the notes. */
  motivo: z.string().trim().max(200).optional(),
});

export type GuardarPendienteResult =
  | { ok: true; folio: string; ordenId: string; total: number }
  | { ok: false; error: string };
export type ListarPendientesResult =
  | { ok: true; orders: PendingOrder[] }
  | { ok: false; error: string };
export type SimpleResult = { ok: true } | { ok: false; error: string };

const YA_NO_PENDIENTE = "El pedido ya fue cobrado o cancelado.";
const YA_CANCELADO = "El pedido ya estaba cancelado o combinado.";

/**
 * Save an unpaid order. Without `ordenId` a new pending order is created (it
 * takes a folio right away so the kitchen label can print). With `ordenId`
 * the lines and header of an existing pending order are replaced, re-priced
 * from the live catalog; the folio is kept.
 */
export async function guardarPendiente(input: unknown): Promise<GuardarPendienteResult> {
  const parsed = GuardarPendienteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pedido inválido." };
  const ctx = await requirePosContext();
  const { supabase, organizationId: orgId } = ctx;

  const priced = priceLines(ctx.catalog, parsed.data.lines);
  if (!priced.ok) return priced;
  const { ordenId, ...base } = parsed.data;

  if (!ordenId) {
    const ins = await insertOrden(ctx, base, priced, {
      status: "pendiente",
      payment_method: null,
      tendered_cop: null,
      change_cop: 0,
      paid_at: null,
      por_verificar: parsed.data.porVerificar ?? null,
    });
    if (!ins.ok) return ins;
    if (!ins.existing) await syncOrderConsumption(supabase, orgId, ins.ordenId, actorId(ctx));
    return { ok: true, folio: ins.folio, ordenId: ins.ordenId, total: priced.subtotal };
  }

  const { data: existing } = await supabase
    .from("ordenes")
    .select("id, folio")
    .eq("id", ordenId)
    .eq("organization_id", orgId)
    .eq("status", "pendiente")
    .maybeSingle();
  if (!existing) return { ok: false, error: YA_NO_PENDIENTE };

  // Approved discounts of this order follow it through the edit (from list prices).
  const reglas = await reglasAprobadas(supabase, orgId, ordenId);
  let descuento = 0;
  if (reglas.length) {
    const d = aplicarDescuentos(
      priced.items.map((it) => ({
        kind: it.line.kind,
        productoId: it.line.kind === "item" ? it.line.id : null,
        qty: it.line.qty,
        unit: it.unit,
        base: it.line.kind === "item" ? ctx.catalog.byId[it.line.id]?.price ?? null : null,
      })),
      reglas,
    );
    priced.items.forEach((it, i) => { it.unit = d.units[i]; });
    descuento = d.descuento;
  }
  const total = priced.subtotal - descuento;

  const { data: old } = await supabase
    .from("orden_items")
    .select("id, position, kind, producto_id, combo_id, name, mods, customer_name")
    .eq("orden_id", ordenId)
    .eq("organization_id", orgId);
  const oldIds = (old ?? []).map((r) => r.id as string);

  // Insert the new lines first so a failure never leaves the order empty.
  const newRows = itemRows(orgId, ordenId, priced.items);
  const { error: insErr } = await supabase
    .from("orden_items")
    .insert(newRows);
  if (insErr) {
    console.error("[guardarPendiente] insert items failed:", insErr);
    return { ok: false, error: "No se pudieron guardar los productos." };
  }
  if (oldIds.length) {
    const { error: delErr } = await supabase
      .from("orden_items")
      .delete()
      .in("id", oldIds)
      .eq("organization_id", orgId);
    if (delErr) console.error("[guardarPendiente] delete old items failed:", delErr);
  }
  // The cup labels were printed for the old lines: their QRs follow their drinks.
  await reubicarEnlaces(ordenId, (old ?? []).map((r) => ({
    position: Number(r.position), kind: r.kind as string, producto_id: (r.producto_id as string | null) ?? null, combo_id: (r.combo_id as string | null) ?? null,
    name: r.name as string, mods: r.mods, customer_name: (r.customer_name as string | null) ?? null,
  })), newRows);
  const { error: updErr } = await supabase
    .from("ordenes")
    .update({
      order_type: base.orderType,
      subtotal_cop: priced.subtotal,
      total_cop: total,
      descuento_cop: descuento,
      sin_gluten: base.sinGluten,
      notes: base.note || null,
      customer_name: base.customerName || null,
      customer_names: base.customerNames ?? [],
      ...(base.seLoLlevamos !== undefined ? { se_lo_llevamos: base.seLoLlevamos } : {}),
    })
    .eq("id", ordenId)
    .eq("organization_id", orgId);
  if (updErr) {
    console.error("[guardarPendiente] update orden failed:", updErr);
    return { ok: false, error: "No se pudo guardar el pedido." };
  }
  // Lines changed → take or give back only the difference.
  await syncOrderConsumption(supabase, orgId, ordenId, actorId(ctx));
  return { ok: true, folio: existing.folio as string, ordenId, total };
}

const ListarOrdenesSchema = z.object({
  // «pendiente» = not completed (unpaid, or paid and not delivered); «completada» = paid and delivered.
  status: z.enum(["pendiente", "completada", "cancelada", "todas"]).default("pendiente"),
  /** Bogotá calendar day (YYYY-MM-DD); ignored for the pending queue. */
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/**
 * Orders of the org for the register's Pedidos view. The pending queue is
 * date-less (an open order is open whatever day it was sent) and oldest
 * first; history tabs are one Bogotá day, newest first.
 */
export async function listarOrdenes(input: unknown = {}): Promise<ListarPendientesResult> {
  const parsed = ListarOrdenesSchema.safeParse(input ?? {});
  if (!parsed.success) return { ok: false, error: "Filtro inválido." };
  const { status, day } = parsed.data;
  const { supabase, organizationId: orgId } = await requirePosAuth();
  let q = supabase
    .from("ordenes")
    .select(
      "id, folio, status, order_type, canal, total_cop, sin_gluten, notes, customer_name, customer_names, created_at, paid_at, entregada_at, payment_method, tendered_cop, change_cop, paid_cop, merged_into, se_lo_llevamos, por_verificar, barista_id, orden_items(id, kind, producto_id, combo_id, name, qty, unit_price_cop, mods, position, customer_name), orden_pagos(id, customer_name, method, amount_cop, tendered_cop, change_cop, aprobacion, created_at)",
    )
    .eq("organization_id", orgId);
  if (status === "pendiente") q = q.or("status.eq.pendiente,and(status.eq.pagada,entregada_at.is.null)");
  else if (status === "completada") q = q.eq("status", "pagada").not("entregada_at", "is", null);
  else if (status !== "todas") q = q.eq("status", status);
  if (status !== "pendiente") {
    const d = day ?? bogotaDay();
    q = q.gte("created_at", `${d}T05:00:00Z`).lt("created_at", `${shiftDay(d, 1)}T05:00:00Z`);
  }
  const { data, error } = await q
    .order("created_at", { ascending: status === "pendiente" })
    .limit(200);
  if (error) {
    console.error("[listarOrdenes] failed:", error);
    return { ok: false, error: "No se pudieron cargar los pedidos." };
  }
  // Folios of the orders these were folded into (a self-join the API can't express).
  const mergedIds = [...new Set((data ?? []).map((o) => o.merged_into as string | null).filter((x): x is string => !!x))];
  const folioById = new Map<string, string>();
  if (mergedIds.length) {
    const { data: targets } = await supabase.from("ordenes").select("id, folio").eq("organization_id", orgId).in("id", mergedIds);
    for (const t of targets ?? []) folioById.set(t.id as string, t.folio as string);
  }
  const orders: PosOrder[] = (data ?? []).map((o) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = ((o as any).orden_items ?? []) as Array<Record<string, unknown>>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pagos = ((o as any).orden_pagos ?? []) as Array<Record<string, unknown>>;
    return {
      id: o.id as string,
      folio: o.folio as string,
      status: o.status as PosOrder["status"],
      orderType: o.order_type as PosOrder["orderType"],
      canal: (o.canal as PosOrder["canal"]) ?? "pos",
      total: o.total_cop as number,
      sinGluten: Boolean(o.sin_gluten),
      note: (o.notes as string | null) ?? "",
      customerName: (o.customer_name as string | null) ?? "",
      customerNames: (o.customer_names as string[] | null) ?? [],
      createdAt: o.created_at as string,
      paidAt: (o.paid_at as string | null) ?? null,
      entregadaAt: (o.entregada_at as string | null) ?? null,
      paymentMethod: (o.payment_method as PosOrder["paymentMethod"]) ?? null,
      seLoLlevamos: Boolean(o.se_lo_llevamos),
      porVerificar: (o.por_verificar as PosOrder["porVerificar"]) ?? null,
      baristaId: (o.barista_id as string | null) ?? null,
      tendered: (o.tendered_cop as number | null) ?? null,
      change: (o.change_cop as number) ?? 0,
      paid: Number(o.paid_cop ?? 0),
      pagos: mapPagos(pagos),
      mergedInto: (o.merged_into as string | null) ?? null,
      mergedIntoFolio: o.merged_into ? folioById.get(o.merged_into as string) ?? null : null,
      items: items
        .map((it) => ({
          id: it.id as string,
          kind: it.kind as "item" | "combo",
          productoId: (it.producto_id as string | null) ?? null,
          comboId: (it.combo_id as string | null) ?? null,
          name: it.name as string,
          qty: Number(it.qty),
          unitPrice: Number(it.unit_price_cop),
          mods: ((it.mods as ModSelection | null) ?? {}) as ModSelection,
          position: Number(it.position ?? 0),
          customer: (it.customer_name as string | null) ?? "",
        }))
        .sort((a, b) => a.position - b.position),
    };
  });
  const descs = await descuentosDeOrdenes(supabase, orgId, orders.filter((o) => o.status === "pendiente").map((o) => o.id));
  for (const o of orders) {
    const d = descs.get(o.id);
    if (d?.length) o.descuentos = d;
  }
  return { ok: true, orders };
}

/** Orders not completed yet (unpaid, or paid and not delivered), oldest first — the queue / badge. */
export async function listarPendientes(): Promise<ListarPendientesResult> {
  return listarOrdenes({ status: "pendiente" });
}

function mapPagos(rows: Array<Record<string, unknown>>): OrderPayment[] {
  return rows
    .map((p) => ({
      id: p.id as string,
      customer: (p.customer_name as string | null) ?? null,
      method: p.method as PayMethodId,
      amount: Number(p.amount_cop),
      tendered: (p.tendered_cop as number | null) ?? null,
      change: Number(p.change_cop ?? 0),
      approvalCode: (p.aprobacion as string | null) ?? null,
      createdAt: p.created_at as string,
    }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

const RegistrarPagoSchema = z.object({
  ordenId: z.string().uuid(),
  /** Person this payment is for; null/absent = the table. */
  customerName: z.string().trim().max(40).nullable().optional(),
  payment: PaymentSchema,
  /** Amount to take now; absent = whatever is still owed. */
  amount: z.coerce.number().int().min(1).max(100_000_000).optional(),
});
export type RegistrarPagoResult =
  | {
      ok: true;
      folio: string;
      ordenId: string;
      total: number;
      paid: number;
      remaining: number;
      change: number;
      status: "pendiente" | "pagada";
      pagos: OrderPayment[];
    }
  | { ok: false; error: string };

/**
 * Take one payment on a pending order — the whole balance or one person's
 * part. Every payment is a row in orden_pagos; the order caches the sum in
 * paid_cop, summarises the method (or "mixto") and flips to pagada once the
 * stored total is covered. Charges STORED prices, never a re-price.
 */
async function applyPago(
  ctx: PosAuth,
  ordenId: string,
  customerName: string | null,
  payment: z.infer<typeof PaymentSchema>,
  amount: number | undefined,
): Promise<RegistrarPagoResult> {
  const { supabase, organizationId: orgId } = ctx;
  const { data: orden } = await supabase
    .from("ordenes")
    .select("id, folio, total_cop, paid_cop")
    .eq("id", ordenId)
    .eq("organization_id", orgId)
    .eq("status", "pendiente")
    .maybeSingle();
  if (!orden) return { ok: false, error: YA_NO_PENDIENTE };
  const total = Number(orden.total_cop);
  const remainingBefore = total - Number(orden.paid_cop ?? 0);
  if (remainingBefore <= 0) return { ok: false, error: "Este pedido ya está pagado." };
  const amt = amount ?? remainingBefore;
  if (amt > remainingBefore) return { ok: false, error: "El monto supera lo que falta por cobrar." };
  const tender = settleTender(payment, amt);
  if (!tender.ok) return tender;

  const { error: insErr } = await supabase.from("orden_pagos").insert({
    organization_id: orgId,
    orden_id: ordenId,
    customer_name: customerName || null,
    method: payment.method,
    amount_cop: amt,
    tendered_cop: tender.tendered,
    change_cop: tender.change,
    aprobacion: payment.method === "datafono" ? payment.approvalCode || null : null,
    created_by: actorId(ctx),
  });
  if (insErr) {
    console.error("[applyPago] insert failed:", insErr);
    return { ok: false, error: "No se pudo registrar el pago." };
  }

  const { data: rows } = await supabase
    .from("orden_pagos")
    .select("id, customer_name, method, amount_cop, tendered_cop, change_cop, aprobacion, created_at")
    .eq("orden_id", ordenId)
    .eq("organization_id", orgId);
  const pagos = mapPagos((rows ?? []) as Array<Record<string, unknown>>);
  const paid = pagos.reduce((s, p) => s + p.amount, 0);
  const cash = pagos.filter((p) => p.tendered !== null);
  const settled = paid >= total;
  const { data: updated, error: updErr } = await supabase
    .from("ordenes")
    .update({
      paid_cop: paid,
      payment_method: summarizeMethod(pagos.map((p) => p.method)),
      tendered_cop: cash.length ? cash.reduce((s, p) => s + (p.tendered ?? 0), 0) : null,
      change_cop: pagos.reduce((s, p) => s + p.change, 0),
      // Money arrived: the transfer is no longer waiting to be checked.
      por_verificar: null,
      ...(settled ? { status: "pagada", paid_at: new Date().toISOString() } : {}),
    })
    .eq("id", ordenId)
    .eq("organization_id", orgId)
    .eq("status", "pendiente")
    .select("id");
  if (updErr) {
    console.error("[applyPago] update failed:", updErr);
    return { ok: false, error: "No se pudo registrar el pago." };
  }
  if (!updated?.length) return { ok: false, error: YA_NO_PENDIENTE };
  return {
    ok: true,
    folio: orden.folio as string,
    ordenId,
    total,
    paid,
    remaining: Math.max(0, total - paid),
    change: tender.change,
    status: settled ? "pagada" : "pendiente",
    pagos,
  };
}

/** One payment — a person's share, or the rest of the bill. */
export async function registrarPago(input: unknown): Promise<RegistrarPagoResult> {
  const parsed = RegistrarPagoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pago inválido." };
  const ctx = await requirePosAuth();
  const { ordenId, customerName, payment, amount } = parsed.data;
  return applyPago(ctx, ordenId, customerName ?? null, payment, amount);
}

const QuitarPagoSchema = z.object({ ordenId: z.string().uuid(), pagoId: z.string().uuid() });
export type QuitarPagoResult = { ok: true; paid: number; pagos: OrderPayment[] } | { ok: false; error: string };

/**
 * «Pago mixto»: take back one part of an order that is still being paid (the
 * datáfono part entered by mistake, a transfer that didn't land). Only while
 * the order is pendiente — once paid, it is cancelled instead.
 */
export async function quitarPago(input: unknown): Promise<QuitarPagoResult> {
  const parsed = QuitarPagoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pago inválido." };
  const ctx = await requirePosAuth();
  const { supabase, organizationId: orgId } = ctx;
  const { ordenId, pagoId } = parsed.data;
  const { data: orden } = await supabase
    .from("ordenes")
    .select("id")
    .eq("id", ordenId)
    .eq("organization_id", orgId)
    .eq("status", "pendiente")
    .maybeSingle();
  if (!orden) return { ok: false, error: YA_NO_PENDIENTE };
  const { data: gone, error: delErr } = await supabase
    .from("orden_pagos")
    .delete()
    .eq("id", pagoId)
    .eq("orden_id", ordenId)
    .eq("organization_id", orgId)
    .select("id");
  if (delErr) {
    console.error("[quitarPago] delete failed:", delErr);
    return { ok: false, error: "No se pudo quitar el pago." };
  }
  if (!gone?.length) return { ok: false, error: "Ese pago ya no está." };
  const { data: rows } = await supabase
    .from("orden_pagos")
    .select("id, customer_name, method, amount_cop, tendered_cop, change_cop, aprobacion, created_at")
    .eq("orden_id", ordenId)
    .eq("organization_id", orgId);
  const pagos = mapPagos((rows ?? []) as Array<Record<string, unknown>>);
  const paid = pagos.reduce((n, p) => n + p.amount, 0);
  const cash = pagos.filter((p) => p.tendered !== null);
  const { error: updErr } = await supabase
    .from("ordenes")
    .update({
      paid_cop: paid,
      payment_method: summarizeMethod(pagos.map((p) => p.method)),
      tendered_cop: cash.length ? cash.reduce((n, p) => n + (p.tendered ?? 0), 0) : null,
      change_cop: pagos.reduce((n, p) => n + p.change, 0),
    })
    .eq("id", ordenId)
    .eq("organization_id", orgId)
    .eq("status", "pendiente");
  if (updErr) console.error("[quitarPago] update failed:", updErr);
  return { ok: true, paid, pagos };
}

/**
 * Settle a pending order in one go: a single payment for whatever is still
 * owed (the stored total, minus any partial payments). Kept for the
 * register's "Cobrar" button; per-person payments go through registrarPago.
 */
export async function cobrarPendiente(input: unknown): Promise<CrearOrdenResult> {
  const parsed = CobrarPendienteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pago inválido." };
  const ctx = await requirePosAuth();
  const res = await applyPago(ctx, parsed.data.ordenId, null, parsed.data.payment, undefined);
  if (!res.ok) return res;
  return { ok: true, folio: res.folio, ordenId: res.ordenId, total: res.total, change: res.change };
}

const CombinarSchema = z.object({
  targetId: z.string().uuid(),
  sourceIds: z.array(z.string().uuid()).min(1).max(20),
});
export type CombinarResult = { ok: true; targetId: string } | { ok: false; error: string };

/**
 * Fold pending orders into one. The database function moves lines and
 * payments, unions the roster, recomputes totals and cancels the sources in
 * a single transaction (nothing half-moved on failure); then inventory is
 * re-synced for every order involved — the sources give their ingredients
 * back and the target takes them, so the net is zero.
 */
export async function combinarPendientes(input: unknown): Promise<CombinarResult> {
  const parsed = CombinarSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Selección inválida." };
  const ctx = await requirePosAuth();
  const { supabase, organizationId: orgId } = ctx;
  const { targetId, sourceIds } = parsed.data;
  if (sourceIds.includes(targetId)) return { ok: false, error: "El destino no puede estar entre las fuentes." };
  const { error } = await supabase.rpc("combinar_ordenes", { p_org: orgId, p_target: targetId, p_sources: sourceIds });
  if (error) {
    console.error("[combinarPendientes] rpc:", error);
    return { ok: false, error: error.message || "No se pudieron combinar los pedidos." };
  }
  for (const id of [targetId, ...sourceIds]) await syncOrderConsumption(supabase, orgId, id, actorId(ctx));
  // Discounts travel with their lines: the RPC summed the (discounted) lines;
  // re-price so the target's subtotal/descuento and later edits stay right.
  const { data: moved } = await supabase
    .from("orden_descuentos")
    .update({ orden_id: targetId })
    .eq("organization_id", orgId)
    .in("orden_id", sourceIds)
    .select("id");
  const { count } = await supabase.from("orden_descuentos").select("id", { count: "exact", head: true }).eq("orden_id", targetId).eq("estado", "aprobado");
  if (moved?.length || count) {
    const pctx = await requirePosContext();
    const r = await repricearOrden(supabase, orgId, targetId, pctx.catalog);
    if (!r.ok) console.error("[combinarPendientes] repricear:", r.error);
  }
  return { ok: true, targetId };
}

/**
 * Void an order: unpaid, partly paid or paid (not yet cancelled or merged).
 * Payments are not refunded here — the overlay tells the cashier to hand the
 * money back, the note records it, and the arqueo leaves cancelled orders out.
 */

export async function cancelarPendiente(input: unknown): Promise<SimpleResult> {
  const parsed = CancelarPendienteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pedido inválido." };
  const ctx = await requirePosAuth();
  const { supabase, organizationId: orgId } = ctx;
  // Unpaid orders and paid ones (the overlay tells the cashier to hand the
  // money back). Already cancelled — or folded into another — never again.
  const { data: cur } = await supabase
    .from("ordenes")
    .select("status, paid_cop, total_cop, notes")
    .eq("id", parsed.data.ordenId)
    .eq("organization_id", orgId)
    .in("status", ["pendiente", "pagada"])
    .maybeSingle();
  if (!cur) return { ok: false, error: YA_CANCELADO };
  // A direct «Cobrar» sale keeps paid_cop at 0: the whole total was paid.
  const paid = cur.status === "pagada" ? Math.max(Number(cur.paid_cop ?? 0), Number(cur.total_cop ?? 0)) : Number(cur.paid_cop ?? 0);
  const notes = cancelNotes(cur.notes as string | null, parsed.data.motivo, paid);
  const { data: updated, error } = await supabase
    .from("ordenes")
    .update({ status: "cancelada", notes })
    .eq("id", parsed.data.ordenId)
    .eq("organization_id", orgId)
    .eq("status", cur.status as string)
    .select("id");
  if (error) {
    console.error("[cancelarPendiente] update failed:", error);
    return { ok: false, error: "No se pudo cancelar el pedido." };
  }
  if (!updated?.length) return { ok: false, error: YA_CANCELADO };
  // Voided → give the ingredients back.
  await syncOrderConsumption(supabase, orgId, parsed.data.ordenId, actorId(ctx));
  return { ok: true };
}

const ContarCompletadosSchema = z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
/** How many orders of a Bogotá day are complete (paid and delivered) — the «Completados · N» count. */
export async function contarCompletados(input: unknown = {}): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const parsed = ContarCompletadosSchema.safeParse(input ?? {});
  if (!parsed.success) return { ok: false, error: "Filtro inválido." };
  const d = parsed.data.day ?? bogotaDay();
  const { supabase, organizationId: orgId } = await requirePosAuth();
  const { count, error } = await supabase
    .from("ordenes")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("status", "pagada")
    .not("entregada_at", "is", null)
    .gte("created_at", `${d}T05:00:00Z`)
    .lt("created_at", `${shiftDay(d, 1)}T05:00:00Z`);
  if (error) return { ok: false, error: "No se pudo contar." };
  return { ok: true, count: count ?? 0 };
}

// ── «Hoy en ventas» (/pos/ventas) ─────────────────────────────────────────────
const ResumenVentasSchema = z.object({ periodo: z.enum(["hoy", "ayer", "semana"]) });
export type ResumenVentasResult =
  | {
      ok: true;
      resumen: ResumenVentas;
      /** Sold in the same span one week earlier. */
      antes: number;
      /** organizations.meta_diaria_cop (null = no goal set). */
      metaDiaria: number | null;
      /** profile id → full name, for «Por barista». */
      nombres: Record<string, string>;
      at: number;
    }
  | { ok: false; error: string };

/** Team-facing sales summary of today, yesterday or this week (lib/pos/ventas.ts). */
export async function resumenVentas(input: unknown): Promise<ResumenVentasResult> {
  const parsed = ResumenVentasSchema.safeParse(input ?? {});
  if (!parsed.success) return { ok: false, error: "Periodo inválido." };
  const { periodo } = parsed.data;
  const { supabase, organizationId: orgId } = await requirePosAuth();
  const now = Date.now();
  const w = ventanaVentas(periodo, now);
  const iso = (ms: number) => new Date(ms).toISOString();
  const [main, prev, org] = await Promise.all([
    supabase
      .from("ordenes")
      .select("id, status, total_cop, created_at, payment_method, merged_into, created_by, orden_items(kind, producto_id, combo_id, name, qty), orden_pagos(method, amount_cop)")
      .eq("organization_id", orgId)
      .gte("created_at", iso(w.desde))
      .lt("created_at", iso(w.hasta))
      .order("created_at", { ascending: true })
      .limit(3000),
    supabase
      .from("ordenes")
      .select("total_cop")
      .eq("organization_id", orgId)
      .eq("status", "pagada")
      .gte("created_at", iso(w.antes.desde))
      .lt("created_at", iso(w.antes.hasta))
      .limit(3000),
    // The goal column arrives with 0065; until then the card just says «Sin meta».
    Promise.resolve(supabase.from("organizations").select("meta_diaria_cop").eq("id", orgId).maybeSingle()).catch(() => ({ data: null })),
  ]);
  if (main.error) {
    console.error("[resumenVentas] failed:", main.error);
    return { ok: false, error: "No se pudieron cargar las ventas." };
  }
  const rows = (main.data ?? []) as Array<Record<string, unknown>>;
  const ordenes: VentaOrden[] = rows.map((o) => ({
    id: o.id as string,
    status: o.status as VentaOrden["status"],
    total: Number(o.total_cop ?? 0),
    createdAt: o.created_at as string,
    method: (o.payment_method as string | null) ?? null,
    merged: !!o.merged_into,
    createdBy: (o.created_by as string | null) ?? null,
    items: ((o.orden_items ?? []) as Array<Record<string, unknown>>).map((it) => ({
      key: ((it.kind === "combo" ? it.combo_id : it.producto_id) as string | null) ?? `name:${it.name as string}`,
      name: it.name as string,
      qty: Number(it.qty ?? 0),
    })),
    pagos: ((o.orden_pagos ?? []) as Array<Record<string, unknown>>).map((p) => ({ method: p.method as string, amount: Number(p.amount_cop ?? 0) })),
  }));
  const resumen = resumirVentas(ordenes, { periodo, now });
  const ids = resumen.personas.map((p) => p.id).filter((x): x is string => !!x);
  const nombres: Record<string, string> = {};
  if (ids.length) {
    const { data: people } = await supabase.from("profiles").select("id, full_name").in("id", ids);
    for (const p of (people ?? []) as Array<{ id: string; full_name: string | null }>) nombres[p.id] = p.full_name ?? "";
  }
  const antes = ((prev.data ?? []) as Array<{ total_cop: number }>).reduce((n, o) => n + Number(o.total_cop ?? 0), 0);
  const metaRaw = (org.data as { meta_diaria_cop?: number | null } | null)?.meta_diaria_cop;
  return { ok: true, resumen, antes, metaDiaria: metaRaw ? Number(metaRaw) : null, nombres, at: now };
}

// ── se lo llevamos ────────────────────────────────────────────────────────────
const SeLoLlevamosSchema = z.object({ ordenId: z.string().uuid(), value: z.boolean() });

/** The barista will bring this order to the customer (or not any more). */
export async function marcarSeLoLlevamos(input: unknown): Promise<SimpleResult> {
  const parsed = SeLoLlevamosSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pedido inválido." };
  const ctx = await requirePosAuth();
  const { error } = await ctx.supabase
    .from("ordenes")
    .update({ se_lo_llevamos: parsed.data.value })
    .eq("id", parsed.data.ordenId)
    .eq("organization_id", ctx.organizationId)
    .in("status", ["pendiente", "pagada"]);
  if (error) {
    console.error("[marcarSeLoLlevamos] update failed:", error);
    return { ok: false, error: "No se pudo guardar." };
  }
  return { ok: true };
}

// ── entrega ───────────────────────────────────────────────────────────────────
const MarcarEntregaSchema = z.object({ ordenId: z.string().uuid(), entregada: z.boolean() });

/** Mark an order as handed to the customer (or undo it). Payment is untouched. */
export async function marcarEntrega(input: unknown): Promise<{ ok: true; entregadaAt: string | null } | { ok: false; error: string }> {
  const parsed = MarcarEntregaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pedido inválido." };
  const ctx = await requirePosAuth();
  const { supabase, organizationId: orgId } = ctx;
  const entregadaAt = parsed.data.entregada ? new Date().toISOString() : null;
  const { data: updated, error } = await supabase
    .from("ordenes")
    .update({ entregada_at: entregadaAt, entregada_by: parsed.data.entregada ? actorId(ctx) : null })
    .eq("id", parsed.data.ordenId)
    .eq("organization_id", orgId)
    .in("status", ["pendiente", "pagada"])
    .select("id");
  if (error) {
    console.error("[marcarEntrega] update failed:", error);
    return { ok: false, error: "No se pudo marcar la entrega." };
  }
  if (!updated?.length) return { ok: false, error: "Ese pedido ya no está activo." };
  return { ok: true, entregadaAt };
}

// ── "frase del día" label ─────────────────────────────────────────────────────
export type GenerarFraseResult =
  | { ok: true; texto: string; categoria: FraseCategoria }
  | { ok: false; error: string };

/**
 * One short phrase for the cup label: a random category, or the feeling
 * asked for. With `productoId` the phrase is about that drink (a Milo frío
 * gets a phrase about the Milo); the name is read from the catalog here, so
 * nothing the client types reaches the prompt. An unknown id falls back to
 * the coffee phrase.
 */
export async function generarFrase(tono?: FraseTono, productoId?: string): Promise<GenerarFraseResult> {
  const { catalog } = await requirePosContext();
  const parsedTono = z.enum(FRASE_TONO_IDS).optional().safeParse(tono);
  if (!parsedTono.success) return { ok: false, error: "Tono no válido." };
  const parsedId = z.string().max(64).optional().safeParse(productoId);
  const producto = parsedId.success && parsedId.data ? catalog.byId[parsedId.data] : undefined;
  try {
    const r = await generarFraseCafe({
      orgName: catalog.orgName,
      tono: parsedTono.data,
      bebida: producto ? fraseBebida(producto) : undefined,
    });
    return { ok: true, ...r };
  } catch (err) {
    if (err instanceof MissingGroqKeyError || err instanceof GroqRateLimitError) {
      return { ok: false, error: err.message };
    }
    console.error("[generarFrase] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "No se pudo generar la frase." };
  }
}

// ── labels relayed to the station with the printer ───────────────────────────
/** A station without a printer asks for these labels to be printed elsewhere. */
export async function encolarEtiquetas(
  specs: LabelSpec[],
): Promise<{ ok: true; n: number } | { ok: false; error: string }> {
  const { supabase, organizationId, station } = await requirePosAuth();
  const parsed = z.array(LabelSpecSchema).min(1).max(RELAY_BATCH_MAX).safeParse(specs);
  if (!parsed.success) return { ok: false, error: "Etiqueta no válida." };
  const { error } = await supabase.from("pos_print_jobs").insert(
    parsed.data.map((payload, seq) => ({ organization_id: organizationId, seq, payload, source: station, clase: "etiqueta" })),
  );
  if (error) {
    console.error("[encolarEtiquetas] failed:", error.message);
    return { ok: false, error: "No se pudo enviar la etiqueta." };
  }
  return { ok: true, n: parsed.data.length };
}

/**
 * The station with the printer takes the waiting labels. One UPDATE claims
 * them, so two printing stations never print the same label; anything older
 * than the TTL stays behind and is swept a day later.
 */
export async function reclamarEtiquetas(): Promise<{ ok: true; jobs: LabelSpec[] } | { ok: false }> {
  const { supabase, organizationId, station } = await requirePosAuth();
  const now = Date.now();
  const { data, error } = await supabase
    .from("pos_print_jobs")
    .update({ status: "reclamada", claimed_by: station, claimed_at: new Date(now).toISOString() })
    .eq("organization_id", organizationId)
    .eq("clase", "etiqueta")
    .eq("status", "pendiente")
    .gt("created_at", new Date(now - RELAY_TTL_MS).toISOString())
    .select("payload, created_at, seq");
  if (error) {
    console.error("[reclamarEtiquetas] failed:", error.message);
    return { ok: false };
  }
  const rows = ((data ?? []) as Array<{ payload: unknown; created_at: string; seq: number }>).sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.seq - b.seq,
  );
  const jobs: LabelSpec[] = [];
  for (const r of rows) {
    const ok = LabelSpecSchema.safeParse(r.payload);
    if (ok.success) jobs.push(ok.data);
  }
  if (jobs.length) {
    // Housekeeping rides on real traffic: yesterday's rows are of no use.
    await supabase
      .from("pos_print_jobs")
      .delete()
      .eq("organization_id", organizationId)
      .lt("created_at", new Date(now - 24 * 3600_000).toISOString());
  }
  return { ok: true, jobs };
}

// ── receipts and comandas relayed to the receipt printer (0064) ───────────────
/** A station without the receipt printer asks the one that has it to print these. */
export async function encolarTickets(
  docs: TicketDoc[],
): Promise<{ ok: true; n: number; ids: string[] } | { ok: false; error: string }> {
  const { supabase, organizationId, station } = await requirePosAuth();
  const parsed = z.array(TicketDocSchema).min(1).max(10).safeParse(docs);
  if (!parsed.success) return { ok: false, error: "Recibo no válido." };
  const { data, error } = await supabase
    .from("pos_print_jobs")
    .insert(parsed.data.map((payload, seq) => ({ organization_id: organizationId, seq, payload, source: station, clase: "ticket" })))
    .select("id");
  if (error) {
    console.error("[encolarTickets] failed:", error.message);
    return { ok: false, error: "No se pudo enviar el recibo." };
  }
  return { ok: true, n: parsed.data.length, ids: ((data ?? []) as Array<{ id: string }>).map((r) => r.id) };
}

/** How many of these relayed tickets no station has taken yet (the sender checks a bit later). */
export async function ticketsSinTomar(ids: string[]): Promise<{ ok: true; sinTomar: number } | { ok: false }> {
  const parsed = z.array(z.string().uuid()).min(1).max(20).safeParse(ids);
  if (!parsed.success) return { ok: false };
  const { supabase, organizationId } = await requirePosAuth();
  const { data, error } = await supabase
    .from("pos_print_jobs")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("status", "pendiente")
    .in("id", parsed.data);
  if (error) return { ok: false };
  return { ok: true, sinTomar: (data ?? []).length };
}

/**
 * Heartbeat of the receipt printer (0068). The station («Aquí») reports it is
 * open and whether its prints skip the dialog; any other device clears its
 * row in case it was the station before. Everyone gets back the open
 * stations and how many tickets are waiting for one.
 */
export async function latidoImpresoras(input: Latido): Promise<({ ok: true } & EstadoImpresoras) | { ok: false }> {
  const parsed = LatidoSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  const { deviceId, estacion } = parsed.data;
  const { supabase, organizationId, station } = await requirePosAuth();
  const now = Date.now();
  const write = estacion
    ? supabase.from("pos_ticket_estaciones").upsert(
        {
          organization_id: organizationId,
          device_id: deviceId,
          nombre: station.slice(0, 80),
          equipo: estacion.equipo || null,
          silencioso: estacion.silencioso,
          papel: estacion.papel,
          visto_at: new Date(now).toISOString(),
        },
        { onConflict: "organization_id,device_id" },
      )
    : supabase.from("pos_ticket_estaciones").delete().eq("organization_id", organizationId).eq("device_id", deviceId);
  const { error: werr } = await write;
  if (werr) console.error("[latidoImpresoras] write failed:", werr.message);
  const [vivas, cola] = await Promise.all([
    supabase
      .from("pos_ticket_estaciones")
      .select("device_id, nombre, equipo, silencioso, visto_at")
      .eq("organization_id", organizationId)
      .gt("visto_at", new Date(now - ESTACION_VIVA_MS).toISOString())
      .order("visto_at", { ascending: false }),
    supabase
      .from("pos_print_jobs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("clase", "ticket")
      .eq("status", "pendiente")
      .gt("created_at", new Date(now - RELAY_TTL_MS).toISOString()),
  ]);
  if (vivas.error) {
    console.error("[latidoImpresoras] read failed:", vivas.error.message);
    return { ok: false };
  }
  const estaciones: TicketEstacion[] = (
    (vivas.data ?? []) as Array<{ device_id: string; nombre: string; equipo: string | null; silencioso: boolean | null; visto_at: string }>
  ).map((r) => ({
    deviceId: r.device_id,
    nombre: r.nombre,
    equipo: r.equipo,
    silencioso: r.silencioso,
    hace: Math.max(0, Math.round((now - Date.parse(r.visto_at)) / 1000)),
  }));
  return { ok: true, estaciones, enEspera: cola.count ?? 0 };
}

/** The receipt printer station takes the waiting tickets (same claim-by-UPDATE as the labels). */
export async function reclamarTickets(): Promise<{ ok: true; docs: TicketDoc[] } | { ok: false }> {
  const { supabase, organizationId, station } = await requirePosAuth();
  const now = Date.now();
  const { data, error } = await supabase
    .from("pos_print_jobs")
    .update({ status: "reclamada", claimed_by: station, claimed_at: new Date(now).toISOString() })
    .eq("organization_id", organizationId)
    .eq("clase", "ticket")
    .eq("status", "pendiente")
    .gt("created_at", new Date(now - RELAY_TTL_MS).toISOString())
    .select("payload, created_at, seq");
  if (error) {
    console.error("[reclamarTickets] failed:", error.message);
    return { ok: false };
  }
  const rows = ((data ?? []) as Array<{ payload: unknown; created_at: string; seq: number }>).sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.seq - b.seq,
  );
  const docs: TicketDoc[] = [];
  for (const r of rows) {
    const ok = TicketDocSchema.safeParse(r.payload);
    if (ok.success) docs.push(ok.data);
  }
  return { ok: true, docs };
}

// ── live AI suggestions ──────────────────────────────────────────────────────
const SuggestSchema = z.object({
  transcript: z
    .array(z.object({ who: z.string(), text: z.string() }))
    .max(40),
  cart: z
    .array(
      z.object({
        name: z.string(),
        qty: z.coerce.number().int(),
        mods: z.array(z.string()).default([]),
      }),
    )
    .max(60),
  orderType: z.string().default("aqui"),
  sinGluten: z.boolean().default(false),
});

export type PosSuggestResult =
  | { ok: true; suggestions: PosSuggest[]; filter: PosCatalogFilter | null }
  | { ok: false; error: string; missingKey?: boolean };

/** Keep only suggestions whose action ids all exist in the live catalog. */
function validateSuggestion(
  catalog: PosCatalog,
  s: PosSuggest,
): PosSuggest | null {
  const act = s.act;
  if (act) {
    const cleaned = validateAct(catalog, act);
    if (cleaned === null) return null; // action referenced something unreal
    s = { ...s, act: cleaned };
  }
  if (s.focus) {
    const catOk = !s.focus.catId || s.focus.catId in catalog.catLabel;
    const hlOk =
      !s.focus.highlightId ||
      s.focus.highlightId in catalog.byId ||
      s.focus.highlightId in catalog.comboById;
    if (!catOk || !hlOk) {
      const { focus: _drop, ...rest } = s;
      void _drop;
      s = rest;
    }
  }
  return s;
}

function validateAct(catalog: PosCatalog, act: PosAct): PosAct | null {
  switch (act.type) {
    case "add":
    case "mods":
      if (!(act.id in catalog.byId)) return null;
      if (act.type === "mods") {
        const set: Record<string, string | string[]> = {};
        for (const gid in act.set) {
          const g = catalog.modGroups[gid];
          if (!g) continue;
          const sel = act.set[gid];
          const names = (Array.isArray(sel) ? sel : [sel]).filter((n) =>
            g.options.some((o) => o.name === n),
          );
          if (names.length) set[gid] = g.type === "single" ? names[0] : names;
        }
        if (!Object.keys(set).length) return null;
        return { type: "mods", id: act.id, set };
      }
      return act;
    case "combo":
      return act.id in catalog.comboById ? act : null;
    case "swapCombo":
      return act.removeId in catalog.byId && act.comboId in catalog.comboById
        ? act
        : null;
    case "flag":
    case "loyalty":
      return act;
    default:
      return null;
  }
}

/**
 * Ask the live assistant for suggestions from the running conversation. Grounds
 * on the server's authoritative catalog and drops anything that references ids
 * not in it.
 */
export async function posSuggest(input: unknown): Promise<PosSuggestResult> {
  const parsed = SuggestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Entrada inválida." };

  const { catalog } = await requirePosContext();

  try {
    const raw = await suggestPosActions({
      catalog,
      transcript: parsed.data.transcript,
      cart: parsed.data.cart,
      orderType: parsed.data.orderType,
      sinGluten: parsed.data.sinGluten,
    });
    const suggestions = raw.suggestions
      .map((s) => validateSuggestion(catalog, s))
      .filter((s): s is PosSuggest => s !== null);
    // Keep only filter ids that exist in the live catalog; drop empty filters.
    let filter: PosCatalogFilter | null = null;
    if (raw.filter) {
      const ids = raw.filter.ids.filter((id) => id in catalog.byId);
      if (ids.length) filter = { label: raw.filter.label, ids };
    }
    return { ok: true, suggestions, filter };
  } catch (err) {
    if (err instanceof MissingApiKeyError) {
      return {
        ok: false,
        missingKey: true,
        error: "Falta configurar ANTHROPIC_API_KEY para el asistente.",
      };
    }
    console.error("[posSuggest]", err);
    return { ok: false, error: "El asistente no está disponible ahora." };
  }
}

// ── speech-to-text (Groq Whisper) ─────────────────────────────────────────────
const MAX_AUDIO_BYTES = 8 * 1024 * 1024; // ~8 MB per short segment is plenty

export type TranscribeResult =
  | { ok: true; text: string }
  | {
      ok: false;
      error: string;
      fatal?: boolean;
      rateLimited?: boolean;
      retryAfterMs?: number;
    };

/**
 * Transcribe one recorded audio segment from the POS mic via Groq Whisper.
 * `fatal: true` means the mic should stop (missing key / bad request) rather
 * than keep retrying every segment.
 */
export async function transcribeAudio(
  formData: FormData,
): Promise<TranscribeResult> {
  await requirePosAuth();

  const file = formData.get("audio");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Sin audio." };
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return { ok: false, error: "El segmento de audio es demasiado grande." };
  }

  try {
    const text = await transcribeSegment(file);
    return { ok: true, text };
  } catch (err) {
    if (err instanceof MissingSttKeyError) {
      return {
        ok: false,
        fatal: true,
        error: "Falta configurar GROQ_API_KEY para el dictado por voz.",
      };
    }
    if (err instanceof RateLimitError) {
      return {
        ok: false,
        rateLimited: true,
        retryAfterMs: err.retryAfterMs,
        error: "Límite del plan gratis de Groq alcanzado. Pausando la voz unos segundos… (puedes escribir abajo).",
      };
    }
    console.error("[transcribeAudio]", err);
    return { ok: false, error: "No se pudo transcribir el audio." };
  }
}

// ── device pairing ────────────────────────────────────────────────────────────
const RegistrarSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().max(60).optional(),
});

export type RegistrarPosResult =
  | { ok: true; station: string }
  | { ok: false; error: string };

/**
 * Pair this device with an organization using a registration code generated
 * in Configuración → Punto de venta. On success the device cookie is set and
 * the client refreshes /pos, which now renders the terminal.
 */
export async function registrarPos(input: unknown): Promise<RegistrarPosResult> {
  const parsed = RegistrarSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Código inválido." };

  const res = await registerPosDevice(parsed.data.code, parsed.data.name);
  if (!res.ok) return res;
  revalidatePath("/ajustes/dispositivos");
  return { ok: true, station: res.device.name };
}

/** Unpair this device (revokes it server-side and clears the cookie). */
export async function desvincularPos(): Promise<{ ok: true }> {
  await unlinkCurrentPosDevice();
  revalidatePath("/ajustes/dispositivos");
  return { ok: true };
}

const CalificacionesSchema = z.object({
  ordenId: z.string().uuid(),
  enlaces: z.array(z.object({
    codigo: z.string().regex(/^[2-9A-HJKMNP-Z]{10}$/),
    customer: z.string().trim().max(60).nullable(),
    /** The cup's ticket line; absent on QRs printed before one-QR-per-drink. */
    linea: z.number().int().min(0).max(199).nullable().optional(),
    resto: z.boolean().optional(),
  })).min(1).max(40),
});

/**
 * Register the rating links a sale just printed (one per QR label), so that
 * scanning one opens that customer's own one-use page. The labels never wait
 * for this: the register calls it in the background and retries.
 */
export async function registrarCalificaciones(input: unknown): Promise<{ ok: boolean }> {
  const parsed = CalificacionesSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  const { organizationId } = await requirePosAuth();
  return registrarEnlaces(organizationId, parsed.data.ordenId, parsed.data.enlaces);
}

export type PuntosCliente = { instagram: string; puntos: number; ultimaVisita: string };

/** The customers' points board: every @ with its points, most points first. */
export async function listarPuntos(): Promise<{ ok: true; clientes: PuntosCliente[] } | { ok: false; error: string }> {
  const { supabase, organizationId } = await requirePosAuth();
  const { data, error } = await supabase
    .from("clientes")
    .select("instagram, puntos, ultima_visita_at")
    .eq("organization_id", organizationId)
    .order("puntos", { ascending: false })
    .order("ultima_visita_at", { ascending: false })
    .limit(500);
  if (error) {
    console.error("[listarPuntos]", error);
    return { ok: false, error: "No se pudo cargar la lista de puntos." };
  }
  return {
    ok: true,
    clientes: (data ?? []).map((r) => ({ instagram: r.instagram as string, puntos: Number(r.puntos), ultimaVisita: r.ultima_visita_at as string })),
  };
}

export type ResenaCliente = {
  id: string;
  usadaAt: string;
  estrellas: number;
  sugerencia: string | null;
  bebida: string;
  cliente: string | null;
  instagram: string | null;
  barista: string | null;
};

/** What customers said behind the QR on their cup in the last 30 days, newest first. */
export async function listarResenas(): Promise<{ ok: true; resenas: ResenaCliente[] } | { ok: false; error: string }> {
  const { supabase, organizationId } = await requirePosAuth();
  const { data, error } = await supabase
    .from("calificaciones")
    .select("id, usada_at, estrellas, sugerencia, customer_name, items, cliente:clientes(instagram), orden:ordenes(barista:profiles!ordenes_barista_id_fkey(full_name))")
    .eq("organization_id", organizationId)
    .not("usada_at", "is", null)
    .not("estrellas", "is", null) // «solo sumar mis puntos» answers have no review
    .gte("usada_at", new Date(Date.now() - 30 * 86_400_000).toISOString())
    .order("usada_at", { ascending: false })
    .limit(300);
  if (error) {
    console.error("[listarResenas]", error);
    return { ok: false, error: "No se pudieron cargar las reseñas." };
  }
  const uno = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
  return {
    ok: true,
    resenas: (data ?? []).map((r) => {
      const items = (r.items as { qty: number; name: string }[] | null) ?? [];
      const orden = uno(r.orden as unknown as { barista: unknown } | null);
      return {
        id: r.id as string,
        usadaAt: r.usada_at as string,
        estrellas: Number(r.estrellas),
        sugerencia: ((r.sugerencia as string | null) ?? "").trim() || null,
        bebida: items.map((i) => (i.qty > 1 ? `${i.qty} × ${i.name}` : i.name)).join(" · ") || "Bebida",
        cliente: (r.customer_name as string | null) ?? null,
        instagram: uno(r.cliente as unknown as { instagram: string } | null)?.instagram ?? null,
        barista: uno(orden?.barista as { full_name: string | null } | null)?.full_name ?? null,
      };
    }),
  };
}

// ── Descuentos (mig 0085): the cashier asks, the owner approves ─────────────

const PedirDescuentoSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("precio"), ordenId: z.string().uuid(), productoId: z.string().uuid(), precio: z.coerce.number().int().min(0).max(10_000_000), motivo: z.string().trim().min(3).max(200) }),
  z.object({ tipo: z.literal("porcentaje"), ordenId: z.string().uuid(), porcentaje: z.coerce.number().gt(0).max(100), motivo: z.string().trim().min(3).max(200) }),
]);
export type PedirDescuentoResult =
  | { ok: true; id: string; folio: string; etiqueta: string; antes: number; despues: number; pide: string | null; whatsapp: string | null }
  | { ok: false; error: string };

/**
 * Ask the owner for a discount on a saved, unpaid order. Nothing changes on
 * the order until it is approved; a newer request replaces an older pending one.
 */
export async function pedirDescuento(input: unknown): Promise<PedirDescuentoResult> {
  const parsed = PedirDescuentoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revisa el descuento: falta el motivo o el valor no es válido." };
  const ctx = await requirePosContext();
  const { supabase, organizationId: orgId } = ctx;
  const d = parsed.data;
  const regla: DescuentoRegla = d.tipo === "precio" ? { tipo: "precio", productoId: d.productoId, precio: d.precio } : { tipo: "porcentaje", porcentaje: d.porcentaje };
  const producto = d.tipo === "precio" ? ctx.catalog.byId[d.productoId] : null;
  if (d.tipo === "precio" && !producto) return { ok: false, error: "Ese producto ya no está en el catálogo." };

  const reglas = await reglasAprobadas(supabase, orgId, d.ordenId);
  const calc = await calcularOrden(supabase, orgId, d.ordenId, ctx.catalog, [...reglas, regla]);
  if (!calc || calc.orden.status !== "pendiente") return { ok: false, error: YA_NO_PENDIENTE };
  if (d.tipo === "precio" && !calc.rows.some((r) => r.producto_id === d.productoId)) return { ok: false, error: "Ese producto no está en el pedido." };
  const antes = Number(calc.orden.total_cop);
  if (calc.total >= antes) return { ok: false, error: "Con ese valor el pedido no baja de precio." };
  if (Number(calc.orden.paid_cop ?? 0) > calc.total) return { ok: false, error: "Ya se cobró más de lo que quedaría con el descuento." };

  await supabase.from("orden_descuentos").update({ estado: "anulado", resuelto_at: new Date().toISOString(), respuesta: "Reemplazado por otra solicitud" })
    .eq("organization_id", orgId).eq("orden_id", d.ordenId).eq("estado", "pendiente");
  const pide = ctx.person?.fullName ?? null;
  const row = {
    organization_id: orgId,
    orden_id: d.ordenId,
    tipo: d.tipo,
    producto_id: d.tipo === "precio" ? d.productoId : null,
    producto_nombre: producto?.name ?? null,
    precio_cop: d.tipo === "precio" ? d.precio : null,
    porcentaje: d.tipo === "porcentaje" ? d.porcentaje : null,
    motivo: d.motivo,
    total_antes_cop: antes,
    total_despues_cop: calc.total,
    pedido_por: actorId(ctx),
    pedido_por_nombre: pide,
  };
  const { data: ins, error } = await supabase.from("orden_descuentos").insert(row).select("id").single();
  if (error || !ins) {
    console.error("[pedirDescuento] insert", error);
    return { ok: false, error: "No se pudo guardar la solicitud." };
  }
  const { data: org } = await supabase.from("organizations").select("aprobaciones_whatsapp").eq("id", orgId).maybeSingle();
  const wa = ((org?.aprobaciones_whatsapp as string | null) ?? "").replace(/\D/g, "");
  return {
    ok: true,
    id: ins.id as string,
    folio: calc.orden.folio as string,
    etiqueta: etiquetaDescuento(row),
    antes,
    despues: calc.total,
    pide,
    whatsapp: wa ? (wa.length === 10 ? `57${wa}` : wa) : null,
  };
}

/** Withdraw a request that is still waiting. */
export async function anularDescuento(input: unknown): Promise<SimpleResult> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Solicitud inválida." };
  const ctx = await requirePosAuth();
  const { data, error } = await ctx.supabase
    .from("orden_descuentos")
    .update({ estado: "anulado", resuelto_at: new Date().toISOString(), respuesta: "Retirada desde la caja" })
    .eq("id", parsed.data.id)
    .eq("organization_id", ctx.organizationId)
    .eq("estado", "pendiente")
    .select("id");
  if (error) return { ok: false, error: "No se pudo retirar la solicitud." };
  if (!data?.length) return { ok: false, error: "La solicitud ya fue respondida." };
  return { ok: true };
}
