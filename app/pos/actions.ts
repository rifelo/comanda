"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requirePosContext } from "@/lib/pos/server";
import { registerPosDevice, unlinkCurrentPosDevice } from "@/lib/pos/devices";
import { suggestPosActions, MissingApiKeyError } from "@/lib/ai/pos-assistant";
import { transcribeSegment, MissingSttKeyError, RateLimitError } from "@/lib/ai/transcribe";
import type { PosCatalog, PosSuggest, PosAct, PosCatalogFilter } from "@/lib/pos/types";

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

/**
 * Persist a POS order. Prices are recomputed from the live catalog — the client
 * payload only carries ids/qty/mods, never trusted money. Returns the human
 * folio ("A-247") for the confirmation screen.
 */
export async function crearOrden(input: unknown): Promise<CrearOrdenResult> {
  const parsed = CrearOrdenSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pedido inválido." };

  const { catalog, supabase, organizationId: orgId, actor } =
    await requirePosContext();

  const items = parsed.data.lines.map((l, i) => {
    const priced = lineUnitPrice(catalog, l);
    return priced ? { line: l, ...priced, position: i } : null;
  });
  if (items.some((it) => it === null)) {
    return { ok: false, error: "Un producto del pedido ya no existe." };
  }
  const valid = items as NonNullable<(typeof items)[number]>[];
  const subtotal = valid.reduce((s, it) => s + it.unit * it.line.qty, 0);

  // Tender: change is computed here from the recomputed total, never trusted
  // from the client. Cash short of the total is rejected.
  const payment = parsed.data.payment ?? { method: "efectivo" as const, tendered: null };
  const tendered = payment.method === "efectivo" ? payment.tendered ?? subtotal : null;
  if (tendered !== null && tendered < subtotal) {
    return { ok: false, error: "El efectivo recibido es menor que el total." };
  }
  const change = tendered !== null ? tendered - subtotal : 0;

  const restaurantId =
    actor.kind === "device" ? actor.device.restaurantId : actor.restaurantId;

  // Atomic per-org folio.
  const { data: seq, error: seqErr } = await supabase.rpc("next_orden_folio", {
    p_org: orgId,
  });
  if (seqErr) {
    console.error("[crearOrden] folio rpc failed:", seqErr);
    return { ok: false, error: "No se pudo generar el número de pedido." };
  }
  const folio = `A-${seq}`;

  const { data: orden, error: ordenErr } = await supabase
    .from("ordenes")
    .insert({
      organization_id: orgId,
      restaurant_id: restaurantId,
      folio,
      order_type: parsed.data.orderType,
      subtotal_cop: subtotal,
      total_cop: subtotal,
      sin_gluten: parsed.data.sinGluten,
      notes: parsed.data.note || null,
      payment_method: payment.method,
      tendered_cop: tendered,
      change_cop: change,
      customer_name: parsed.data.customerName || null,
      created_by: actor.kind === "user" ? actor.profileId : null,
      pos_device_id: actor.kind === "device" ? actor.device.id : null,
    })
    .select("id")
    .single();
  if (ordenErr || !orden) {
    console.error("[crearOrden] insert orden failed:", ordenErr);
    return { ok: false, error: "No se pudo guardar el pedido." };
  }

  const { error: itemsErr } = await supabase.from("orden_items").insert(
    valid.map((it) => ({
      organization_id: orgId,
      orden_id: orden.id,
      kind: it.line.kind,
      producto_id: it.line.kind === "item" ? it.line.id : null,
      combo_id: it.line.kind === "combo" ? it.line.id : null,
      name: it.name,
      qty: it.line.qty,
      unit_price_cop: it.unit,
      mods: it.line.mods ?? {},
      position: it.position,
    })),
  );
  if (itemsErr) {
    // Roll back the header so we don't leave an empty order around.
    await supabase.from("ordenes").delete().eq("id", orden.id);
    console.error("[crearOrden] insert items failed:", itemsErr);
    return { ok: false, error: "No se pudieron guardar los productos." };
  }

  return { ok: true, folio, ordenId: orden.id as string, total: subtotal, change };
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
