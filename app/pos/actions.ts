"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requirePosContext } from "@/lib/pos/server";
import { registerPosDevice, unlinkCurrentPosDevice } from "@/lib/pos/devices";
import { suggestPosActions, MissingApiKeyError } from "@/lib/ai/pos-assistant";
import { generarFraseCafe } from "@/lib/ai/frase";
import type { FraseCategoria } from "@/lib/pos/frase";
import { transcribeSegment, MissingSttKeyError, RateLimitError } from "@/lib/ai/transcribe";
import type {
  PosCatalog,
  PosSuggest,
  PosAct,
  PosCatalogFilter,
  PendingOrder,
  ModSelection,
} from "@/lib/pos/types";

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
  customerName: z.string().trim().max(80).optional(),
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
  }));
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
    })
    .eq("id", ordenId)
    .eq("organization_id", orgId);
  if (updErr) {
    console.error("[guardarPendiente] update orden failed:", updErr);
    return { ok: false, error: "No se pudo guardar el pedido." };
  }
  return { ok: true, folio: existing.folio as string, ordenId, total: priced.subtotal };
}

/** Open (unpaid) orders of the org, oldest first — the kitchen queue. */
export async function listarPendientes(): Promise<ListarPendientesResult> {
  const { supabase, organizationId: orgId } = await requirePosContext();
  const { data, error } = await supabase
    .from("ordenes")
    .select(
      "id, folio, order_type, total_cop, sin_gluten, notes, customer_name, created_at, orden_items(id, kind, producto_id, combo_id, name, qty, unit_price_cop, mods, position)",
    )
    .eq("organization_id", orgId)
    .eq("status", "pendiente")
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) {
    console.error("[listarPendientes] failed:", error);
    return { ok: false, error: "No se pudieron cargar los pedidos pendientes." };
  }
  const orders: PendingOrder[] = (data ?? []).map((o) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = ((o as any).orden_items ?? []) as Array<Record<string, unknown>>;
    return {
      id: o.id as string,
      folio: o.folio as string,
      orderType: o.order_type as PendingOrder["orderType"],
      total: o.total_cop as number,
      sinGluten: Boolean(o.sin_gluten),
      note: (o.notes as string | null) ?? "",
      customerName: (o.customer_name as string | null) ?? "",
      createdAt: o.created_at as string,
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
        }))
        .sort((a, b) => a.position - b.position),
    };
  });
  return { ok: true, orders };
}

/**
 * Settle a pending order. Charges the STORED total (what the customer was
 * quoted and the kitchen made), not a re-price. The status-guarded update
 * makes a double charge from two registers impossible.
 */
export async function cobrarPendiente(input: unknown): Promise<CrearOrdenResult> {
  const parsed = CobrarPendienteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pago inválido." };
  const { supabase, organizationId: orgId } = await requirePosContext();
  const { ordenId, payment } = parsed.data;

  const { data: orden } = await supabase
    .from("ordenes")
    .select("id, folio, total_cop")
    .eq("id", ordenId)
    .eq("organization_id", orgId)
    .eq("status", "pendiente")
    .maybeSingle();
  if (!orden) return { ok: false, error: YA_NO_PENDIENTE };
  const total = orden.total_cop as number;
  const tender = settleTender(payment, total);
  if (!tender.ok) return tender;

  const { data: updated, error } = await supabase
    .from("ordenes")
    .update({
      status: "pagada",
      payment_method: payment.method,
      tendered_cop: tender.tendered,
      change_cop: tender.change,
      paid_at: new Date().toISOString(),
    })
    .eq("id", ordenId)
    .eq("organization_id", orgId)
    .eq("status", "pendiente")
    .select("id");
  if (error) {
    console.error("[cobrarPendiente] update failed:", error);
    return { ok: false, error: "No se pudo registrar el pago." };
  }
  if (!updated?.length) return { ok: false, error: YA_NO_PENDIENTE };
  return { ok: true, folio: orden.folio as string, ordenId, total, change: tender.change };
}

/** Void a pending order (never a paid one). */
export async function cancelarPendiente(input: unknown): Promise<SimpleResult> {
  const parsed = CancelarPendienteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pedido inválido." };
  const { supabase, organizationId: orgId } = await requirePosContext();
  const { data: updated, error } = await supabase
    .from("ordenes")
    .update({ status: "cancelada" })
    .eq("id", parsed.data.ordenId)
    .eq("organization_id", orgId)
    .eq("status", "pendiente")
    .select("id");
  if (error) {
    console.error("[cancelarPendiente] update failed:", error);
    return { ok: false, error: "No se pudo cancelar el pedido." };
  }
  if (!updated?.length) return { ok: false, error: YA_NO_PENDIENTE };
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
    if (err instanceof MissingApiKeyError) return { ok: false, error: err.message };
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
  await requirePosContext();

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
