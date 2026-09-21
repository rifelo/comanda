"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requirePosContext, requirePosAuth, type PosAuth } from "@/lib/pos/server";
import { registerPosDevice, unlinkCurrentPosDevice } from "@/lib/pos/devices";
import { suggestPosActions, MissingApiKeyError } from "@/lib/ai/pos-assistant";
import { generarFraseCafe } from "@/lib/ai/frase";
import { MissingGroqKeyError, GroqRateLimitError } from "@/lib/ai/groq";
import type { FraseCategoria } from "@/lib/pos/frase";
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
import { summarizeMethod } from "@/lib/pos/pagos";
import { syncOrderConsumption } from "@/lib/pos/stock";

// ── price recomputation (server is the source of truth, never the client) ────
const ModSelectionSchema = z.record(
  z.string(),
  z.union([z.string(), z.array(z.string())]).nullable(),
);
const LineSchema = z.object({
  kind: z.enum(["item", "combo"]),
  id: z.string(),
  qty: z.coerce.number().int().min(1).max(99),
  mods: ModSelectionSchema.optional(),
  /** Person at the table this line is for (snapshot text; prints on the cup). */
  customer: z.string().trim().max(40).optional(),
});
const PaymentSchema = z.object({
  method: z.enum(["efectivo", "tarjeta", "transferencia"]),
  /** Cash received; only meaningful for efectivo. */
  tendered: z.coerce.number().int().min(0).max(100_000_000).nullable().optional(),
});
const CrearOrdenSchema = z.object({
  orderType: z.enum(["aqui", "llevar", "domicilio"]),
  sinGluten: z.boolean(),
  lines: z.array(LineSchema).min(1).max(60),
  payment: PaymentSchema.optional(),
  /** Table / group label ("Mesa 3"). */
  customerName: z.string().trim().max(80).optional(),
  /** Ordered roster of the table; keeps people who have no line yet. */
  customerNames: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  note: z.string().trim().max(500).optional(),
});

function lineUnitPrice(
  catalog: PosCatalog,
  line: z.infer<typeof LineSchema>,
): { name: string; unit: number } | null {
  if (line.kind === "combo") {
    const c = catalog.comboById[line.id];
    return c ? { name: c.name, unit: c.price } : null;
  }
  const p = catalog.byId[line.id];
  if (!p) return null;
  let extra = 0;
  for (const gid in line.mods ?? {}) {
    const g = catalog.modGroups[gid];
    if (!g) continue;
    const sel = line.mods![gid];
    const names = Array.isArray(sel) ? sel : sel ? [sel] : [];
    for (const n of names) {
      const opt = g.options.find((o) => o.name === n);
      if (opt) extra += opt.delta;
    }
  }
  return { name: p.name, unit: p.price + extra };
}

export type CrearOrdenResult =
  | { ok: true; folio: string; ordenId: string; total: number; change: number }
  | { ok: false; error: string };

type OrdenBase = Omit<z.infer<typeof CrearOrdenSchema>, "payment">;
type PricedItem = { line: z.infer<typeof LineSchema>; name: string; unit: number; position: number };
type PosCtx = Awaited<ReturnType<typeof requirePosContext>>;

/** Re-price every line from the live catalog; the client never sends money. */
function priceLines(
  catalog: PosCatalog,
  lines: z.infer<typeof LineSchema>[],
): { ok: true; items: PricedItem[]; subtotal: number } | { ok: false; error: string } {
  const items: PricedItem[] = [];
  for (const [i, l] of lines.entries()) {
    const priced = lineUnitPrice(catalog, l);
    if (!priced) return { ok: false, error: "Un producto del pedido ya no existe." };
    items.push({ line: l, ...priced, position: i });
  }
  const subtotal = items.reduce((s, it) => s + it.unit * it.line.qty, 0);
  return { ok: true, items, subtotal };
}

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

function itemRows(orgId: string, ordenId: string, items: PricedItem[]) {
  return items.map((it) => ({
    organization_id: orgId,
    orden_id: ordenId,
    kind: it.line.kind,
    producto_id: it.line.kind === "item" ? it.line.id : null,
    combo_id: it.line.kind === "combo" ? it.line.id : null,
    name: it.name,
    qty: it.line.qty,
    unit_price_cop: it.unit,
    mods: it.line.mods ?? {},
    position: it.position,
    customer_name: it.line.customer || null,
  }));
}

/** Profile behind the sale for the movement log (null for a paired device). */
function actorId(ctx: Pick<PosAuth, "actor">): string | null {
  return ctx.actor.kind === "user" ? ctx.actor.profileId : null;
}

type OrdenHeader = {
  status: "pagada" | "pendiente";
  payment_method: z.infer<typeof PaymentSchema>["method"] | null;
  tendered_cop: number | null;
  change_cop: number;
  paid_at: string | null;
};

/** Allocate a folio and insert header + lines (rolls the header back on item failure). */
async function insertOrden(
  ctx: PosCtx,
  data: OrdenBase,
  priced: { items: PricedItem[]; subtotal: number },
  header: OrdenHeader,
): Promise<{ ok: true; folio: string; ordenId: string } | { ok: false; error: string }> {
  const { supabase, organizationId: orgId, actor } = ctx;
  const restaurantId =
    actor.kind === "device" ? actor.device.restaurantId : actor.restaurantId;

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
      created_by: actor.kind === "user" ? actor.profileId : null,
      pos_device_id: actor.kind === "device" ? actor.device.id : null,
      ...header,
    })
    .select("id")
    .single();
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
    paid_at: new Date().toISOString(),
  });
  if (!ins.ok) return ins;
  // Inventory follows the sale; a stock problem is logged, never blocks the receipt.
  await syncOrderConsumption(ctx.supabase, ctx.organizationId, ins.ordenId, actorId(ctx));
  return { ok: true, folio: ins.folio, ordenId: ins.ordenId, total: priced.subtotal, change: tender.change };
}

// ── pending orders ("enviar · pagar después") ────────────────────────────────
const GuardarPendienteSchema = CrearOrdenSchema.omit({ payment: true }).extend({
  /** Present when re-saving an order that is already pending (edit). */
  ordenId: z.string().uuid().optional(),
});
const CobrarPendienteSchema = z.object({
  ordenId: z.string().uuid(),
  payment: PaymentSchema,
});
const CancelarPendienteSchema = z.object({ ordenId: z.string().uuid() });

export type GuardarPendienteResult =
  | { ok: true; folio: string; ordenId: string; total: number }
  | { ok: false; error: string };
export type ListarPendientesResult =
  | { ok: true; orders: PendingOrder[] }
  | { ok: false; error: string };
export type SimpleResult = { ok: true } | { ok: false; error: string };

const YA_NO_PENDIENTE = "El pedido ya fue cobrado o cancelado.";

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
    });
    if (!ins.ok) return ins;
    await syncOrderConsumption(supabase, orgId, ins.ordenId, actorId(ctx));
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

  const { data: old } = await supabase
    .from("orden_items")
    .select("id")
    .eq("orden_id", ordenId)
    .eq("organization_id", orgId);
  const oldIds = (old ?? []).map((r) => r.id as string);

  // Insert the new lines first so a failure never leaves the order empty.
  const { error: insErr } = await supabase
    .from("orden_items")
    .insert(itemRows(orgId, ordenId, priced.items));
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
  const { error: updErr } = await supabase
    .from("ordenes")
    .update({
      order_type: base.orderType,
      subtotal_cop: priced.subtotal,
      total_cop: priced.subtotal,
      sin_gluten: base.sinGluten,
      notes: base.note || null,
      customer_name: base.customerName || null,
      customer_names: base.customerNames ?? [],
    })
    .eq("id", ordenId)
    .eq("organization_id", orgId);
  if (updErr) {
    console.error("[guardarPendiente] update orden failed:", updErr);
    return { ok: false, error: "No se pudo guardar el pedido." };
  }
  // Lines changed → take or give back only the difference.
  await syncOrderConsumption(supabase, orgId, ordenId, actorId(ctx));
  return { ok: true, folio: existing.folio as string, ordenId, total: priced.subtotal };
}

const ListarOrdenesSchema = z.object({
  status: z.enum(["pendiente", "pagada", "cancelada", "todas"]).default("pendiente"),
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
      "id, folio, status, order_type, total_cop, sin_gluten, notes, customer_name, customer_names, created_at, paid_at, payment_method, tendered_cop, change_cop, paid_cop, merged_into, orden_items(id, kind, producto_id, combo_id, name, qty, unit_price_cop, mods, position, customer_name), orden_pagos(id, customer_name, method, amount_cop, tendered_cop, change_cop, created_at)",
    )
    .eq("organization_id", orgId);
  if (status !== "todas") q = q.eq("status", status);
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
      total: o.total_cop as number,
      sinGluten: Boolean(o.sin_gluten),
      note: (o.notes as string | null) ?? "",
      customerName: (o.customer_name as string | null) ?? "",
      customerNames: (o.customer_names as string[] | null) ?? [],
      createdAt: o.created_at as string,
      paidAt: (o.paid_at as string | null) ?? null,
      paymentMethod: (o.payment_method as PosOrder["paymentMethod"]) ?? null,
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
  return { ok: true, orders };
}

/** Open (unpaid) orders of the org, oldest first — the kitchen queue / badge. */
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
    created_by: actorId(ctx),
  });
  if (insErr) {
    console.error("[applyPago] insert failed:", insErr);
    return { ok: false, error: "No se pudo registrar el pago." };
  }

  const { data: rows } = await supabase
    .from("orden_pagos")
    .select("id, customer_name, method, amount_cop, tendered_cop, change_cop, created_at")
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

/**
 * Void a pending order (never a paid one). Partial payments are not
 * refunded here — the note records them so the cash drawer can be squared.
 */
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
  return { ok: true, targetId };
}

export async function cancelarPendiente(input: unknown): Promise<SimpleResult> {
  const parsed = CancelarPendienteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pedido inválido." };
  const ctx = await requirePosAuth();
  const { supabase, organizationId: orgId } = ctx;
  const { data: cur } = await supabase
    .from("ordenes")
    .select("paid_cop, notes")
    .eq("id", parsed.data.ordenId)
    .eq("organization_id", orgId)
    .eq("status", "pendiente")
    .maybeSingle();
  if (!cur) return { ok: false, error: YA_NO_PENDIENTE };
  const paid = Number(cur.paid_cop ?? 0);
  const prev = ((cur.notes as string | null) ?? "").trim();
  const notes = paid > 0
    ? `${prev ? `${prev} · ` : ""}Cancelado con $${paid.toLocaleString("es-CO")} ya pagados (reembolso manual)`
    : cur.notes;
  const { data: updated, error } = await supabase
    .from("ordenes")
    .update({ status: "cancelada", notes })
    .eq("id", parsed.data.ordenId)
    .eq("organization_id", orgId)
    .eq("status", "pendiente")
    .select("id");
  if (error) {
    console.error("[cancelarPendiente] update failed:", error);
    return { ok: false, error: "No se pudo cancelar el pedido." };
  }
  if (!updated?.length) return { ok: false, error: YA_NO_PENDIENTE };
  // Voided → give the ingredients back.
  await syncOrderConsumption(supabase, orgId, parsed.data.ordenId, actorId(ctx));
  return { ok: true };
}

// ── "frase del día" label ─────────────────────────────────────────────────────
export type GenerarFraseResult =
  | { ok: true; texto: string; categoria: FraseCategoria }
  | { ok: false; error: string };

/** One short coffee phrase (random category) for the cup label. */
export async function generarFrase(): Promise<GenerarFraseResult> {
  const { catalog } = await requirePosContext();
  try {
    const r = await generarFraseCafe({ orgName: catalog.orgName });
    return { ok: true, ...r };
  } catch (err) {
    if (err instanceof MissingGroqKeyError || err instanceof GroqRateLimitError) {
      return { ok: false, error: err.message };
    }
    console.error("[generarFrase] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "No se pudo generar la frase." };
  }
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
  revalidatePath("/configuracion/pos");
  return { ok: true, station: res.device.name };
}

/** Unpair this device (revokes it server-side and clears the cookie). */
export async function desvincularPos(): Promise<{ ok: true }> {
  await unlinkCurrentPosDevice();
  revalidatePath("/configuracion/pos");
  return { ok: true };
}
