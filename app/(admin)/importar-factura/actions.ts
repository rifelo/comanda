"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { unitCostFromPack } from "@/lib/cost";
import {
  extractInvoiceItems,
  MissingApiKeyError,
  UNITS,
  type InvoiceItem,
} from "@/lib/ai/invoice";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

/**
 * Read an uploaded invoice image and extract its line items via Claude.
 * Returns the suggested items for the admin to review — nothing is saved here.
 */
export async function extractInvoiceAction(
  formData: FormData,
): Promise<
  | { ok: true; items: InvoiceItem[] }
  | { ok: false; error: string; missingKey?: boolean }
> {
  await requireAdmin();

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Sube una foto de la factura." };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "La imagen supera 10 MB." };
  }
  const mediaType = file.type as (typeof ALLOWED)[number];
  if (!ALLOWED.includes(mediaType)) {
    return { ok: false, error: "Formato no soportado (usa JPG, PNG o WebP)." };
  }

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");

  try {
    const items = await extractInvoiceItems(base64, mediaType);
    if (items.length === 0) {
      return { ok: false, error: "No se reconocieron productos en la factura." };
    }
    return { ok: true, items };
  } catch (err) {
    if (err instanceof MissingApiKeyError) {
      return {
        ok: false,
        missingKey: true,
        error: "Falta configurar ANTHROPIC_API_KEY para usar la IA.",
      };
    }
    console.error("[extractInvoiceAction]", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "No se pudo leer la factura.",
    };
  }
}

const ImportRowSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    categoryId: z.string().uuid().nullable(),
    newCategoryLabel: z.string().trim().min(1).max(120).nullable(),
    unit: z.enum(UNITS),
    isPack: z.boolean(),
    packQty: z.coerce.number().positive().nullable(),
    lineCost: z.coerce.number().int().min(0),
    stockCurrent: z.coerce.number().min(0),
  })
  .refine((r) => !r.isPack || (r.packQty != null && r.packQty > 0), {
    message: "Un paquete necesita unidades por paquete.",
    path: ["packQty"],
  });
const ImportSchema = z.object({ rows: z.array(ImportRowSchema).min(1) });

/**
 * Create ingredientes from the reviewed invoice rows. Derives the per-unit
 * cost from pack purchases (reusing unitCostFromPack), creates any new
 * categories on the fly, and inserts row-by-row so a duplicate name only skips
 * that row instead of failing the whole batch.
 */
export async function importIngredientesBatch(
  input: unknown,
): Promise<
  | { ok: true; created: number; skipped: { name: string; error: string }[] }
  | { ok: false; error: string }
> {
  const parsed = ImportSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Datos inválidos." };
  }
  const { profile, supabase } = await requireAdmin();
  const orgId = profile.organization_id;
  const rows = parsed.data.rows;

  // Create any requested new categories once, then map label -> id.
  const newLabels = [
    ...new Set(
      rows
        .filter((r) => !r.categoryId && r.newCategoryLabel)
        .map((r) => r.newCategoryLabel as string),
    ),
  ];
  const labelToId = new Map<string, string>();
  for (const label of newLabels) {
    // Reuse an existing same-name category if present (avoids a 23505 churn).
    const { data: existing } = await supabase
      .from("ingrediente_categorias")
      .select("id")
      .eq("organization_id", orgId)
      .is("parent_id", null)
      .ilike("label", label)
      .maybeSingle();
    if (existing) {
      labelToId.set(label, existing.id as string);
      continue;
    }
    const { data: created, error } = await supabase
      .from("ingrediente_categorias")
      .insert({ organization_id: orgId, parent_id: null, label })
      .select("id")
      .single();
    if (!error && created) labelToId.set(label, created.id as string);
  }

  let created = 0;
  const skipped: { name: string; error: string }[] = [];

  for (const r of rows) {
    const byPack = r.isPack && r.packQty != null && r.packQty > 0;
    const costCop = byPack ? unitCostFromPack(r.lineCost, r.packQty!) : r.lineCost;
    const categoryId =
      r.categoryId ??
      (r.newCategoryLabel ? labelToId.get(r.newCategoryLabel) ?? null : null);

    const { error } = await supabase.from("ingredientes").insert({
      organization_id: orgId,
      category_id: categoryId,
      name: r.name,
      unit: r.unit,
      unit2: null,
      conversion_factor: null,
      stock_current: r.stockCurrent,
      stock_min: 0,
      merma_pct: 0,
      cost_cop: costCop,
      pack_cost_cop: byPack ? r.lineCost : null,
      pack_qty: byPack ? r.packQty : null,
    });

    if (error) {
      skipped.push({
        name: r.name,
        error:
          error.code === "23505"
            ? "Ya existe un ingrediente con ese nombre."
            : error.message,
      });
    } else {
      created += 1;
    }
  }

  revalidatePath("/inventario");
  return { ok: true, created, skipped };
}
