"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { unitCostFromPack } from "@/lib/cost";
import { recomputeProductosForIngrediente } from "@/lib/db/recetas";

// Units the UI exposes; DB column is plain text so adding a new unit is
// just a Zod change here + the option list in the drawer. `caja` and
// `bulto` are large-pack primaries that pair with a secondary unit
// (and a conversion_factor) to surface stock in the unit the kitchen
// actually consumes.
const UNITS = [
  "kg",
  "g",
  "L",
  "ml",
  "und",
  "porción",
  "loncha",
  "bola",
  "caja",
  "bulto",
] as const;

const CreateCategoriaSchema = z.object({
  label: z.string().trim().min(1).max(120),
  parentId: z.string().uuid().nullable(),
});

const CreateIngredienteSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    categoryId: z.string().uuid().nullable(),
    unit: z.enum(UNITS),
    // `null` clears the field; absent is also fine (falls back to null on
    // insert). Same shape on the update schema below.
    unit2: z.enum(UNITS).nullable().optional(),
    conversionFactor: z.coerce.number().positive().nullable().optional(),
    stockCurrent: z.coerce.number().min(0),
    stockMin: z.coerce.number().min(0),
    mermaPct: z.coerce.number().min(0).max(100).default(0),
    costCop: z.coerce.number().min(0),
    // Pack-purchase costing (optional). When both are present, cost_cop is
    // derived server-side as round(packCostCop / packQty). Both null/absent
    // means costCop is taken as the manual per-unit cost.
    packCostCop: z.coerce.number().int().min(0).nullable().optional(),
    packQty: z.coerce.number().positive().nullable().optional(),
  })
  .refine((d) => !d.unit2 || d.unit2 !== d.unit, {
    message: "La unidad secundaria debe ser distinta de la primaria.",
    path: ["unit2"],
  })
  .refine(
    (d) =>
      (d.packCostCop == null && d.packQty == null) ||
      (d.packCostCop != null && d.packQty != null),
    {
      message: "Indica precio y unidades del paquete, o ninguno.",
      path: ["packQty"],
    },
  );

const UpdateIngredienteSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(160),
    categoryId: z.string().uuid().nullable(),
    unit: z.enum(UNITS),
    unit2: z.enum(UNITS).nullable().optional(),
    conversionFactor: z.coerce.number().positive().nullable().optional(),
    stockMin: z.coerce.number().min(0),
    mermaPct: z.coerce.number().min(0).max(100).default(0),
    costCop: z.coerce.number().min(0),
    // Pack-purchase costing (optional). When both are present, cost_cop is
    // derived server-side as round(packCostCop / packQty). Both null/absent
    // means costCop is taken as the manual per-unit cost.
    packCostCop: z.coerce.number().int().min(0).nullable().optional(),
    packQty: z.coerce.number().positive().nullable().optional(),
  })
  .refine((d) => !d.unit2 || d.unit2 !== d.unit, {
    message: "La unidad secundaria debe ser distinta de la primaria.",
    path: ["unit2"],
  })
  .refine(
    (d) =>
      (d.packCostCop == null && d.packQty == null) ||
      (d.packCostCop != null && d.packQty != null),
    {
      message: "Indica precio y unidades del paquete, o ninguno.",
      path: ["packQty"],
    },
  );

const AdjustStockSchema = z.object({
  id: z.string().uuid(),
  newStock: z.coerce.number().min(0),
  note: z.string().max(200).optional(),
});

const ApplyConteoSchema = z.object({
  counts: z
    .array(
      z.object({
        id: z.string().uuid(),
        physicalCount: z.coerce.number().min(0),
      }),
    )
    .min(1),
});

// Result shapes documented for callers; never exported as types from a
// "use server" file (Next 16 RSC payload gotcha — see
// app/(admin)/restaurants/new/actions.ts).

export async function createIngredienteCategoria(input: unknown) {
  const parsed = CreateCategoriaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Datos inválidos." };
  }
  const { profile, supabase } = await requireAdmin();

  const { data, error } = await supabase
    .from("ingrediente_categorias")
    .insert({
      organization_id: profile.organization_id,
      parent_id: parsed.data.parentId,
      label: parsed.data.label,
    })
    .select("id, organization_id, parent_id, label, position")
    .single();

  if (error) {
    console.error("[createIngredienteCategoria]", error);
    if (error.code === "23505") {
      return {
        ok: false as const,
        error: "Ya existe una categoría con ese nombre en este nivel.",
      };
    }
    return { ok: false as const, error: error.message };
  }

  revalidatePath("/inventario");
  return { ok: true as const, categoria: data };
}

const UpdateCategoriaSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(120),
});

/**
 * Rename a category. The unique (organization_id, parent_id, label)
 * constraint surfaces as code 23505 — translate it into a friendly
 * message so the inline rename input can show it.
 */
export async function updateIngredienteCategoria(input: unknown) {
  const parsed = UpdateCategoriaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Datos inválidos." };
  }
  const { profile, supabase } = await requireAdmin();

  const { data, error } = await supabase
    .from("ingrediente_categorias")
    .update({ label: parsed.data.label })
    .eq("id", parsed.data.id)
    .eq("organization_id", profile.organization_id)
    .select("id, organization_id, parent_id, label, position")
    .single();

  if (error) {
    console.error("[updateIngredienteCategoria]", error);
    if (error.code === "23505") {
      return {
        ok: false as const,
        error: "Ya existe una categoría con ese nombre en este nivel.",
      };
    }
    return { ok: false as const, error: error.message };
  }

  revalidatePath("/inventario");
  return { ok: true as const, categoria: data };
}

/**
 * Hard-delete a category. CASCADE on parent_id wipes descendants and the
 * ON DELETE SET NULL on ingredientes.category_id leaves orphan rows under
 * "Sin categoría" (still visible under "Todos") rather than archiving them.
 */
export async function deleteIngredienteCategoria(
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Categoría inválida." };
  }
  const { profile, supabase } = await requireAdmin();

  const { data: existing } = await supabase
    .from("ingrediente_categorias")
    .select("id")
    .eq("id", parsed.data.id)
    .eq("organization_id", profile.organization_id)
    .maybeSingle();
  if (!existing) {
    return { ok: false, error: "La categoría no existe." };
  }

  const { error: deleteErr } = await supabase
    .from("ingrediente_categorias")
    .delete()
    .eq("id", parsed.data.id);

  if (deleteErr) {
    console.error("[deleteIngredienteCategoria] delete failed:", deleteErr);
    return {
      ok: false,
      error: deleteErr.message ?? "No se pudo eliminar la categoría.",
    };
  }

  revalidatePath("/inventario");
  return { ok: true };
}

export async function createIngrediente(input: unknown) {
  const parsed = CreateIngredienteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Datos inválidos." };
  }
  const { profile, supabase } = await requireAdmin();

  const d = parsed.data;
  // When bought by pack, derive the per-unit cost authoritatively (don't
  // trust client math) and keep the pack fields so a later price change just
  // needs the new pack cost. Otherwise cost_cop is the manual per-unit entry.
  const byPack = d.packCostCop != null && d.packQty != null;
  const costCop = byPack ? unitCostFromPack(d.packCostCop!, d.packQty!) : d.costCop;

  const { data, error } = await supabase
    .from("ingredientes")
    .insert({
      organization_id: profile.organization_id,
      category_id: d.categoryId,
      name: d.name,
      unit: d.unit,
      unit2: d.unit2 ?? null,
      conversion_factor: d.conversionFactor ?? null,
      stock_current: d.stockCurrent,
      stock_min: d.stockMin,
      merma_pct: d.mermaPct,
      cost_cop: costCop,
      pack_cost_cop: byPack ? d.packCostCop : null,
      pack_qty: byPack ? d.packQty : null,
    })
    .select(
      "id, organization_id, category_id, name, unit, unit2, conversion_factor, stock_current, stock_min, merma_pct, cost_cop, pack_cost_cop, pack_qty, archived",
    )
    .single();

  if (error) {
    console.error("[createIngrediente]", error);
    if (error.code === "23505") {
      return {
        ok: false as const,
        error: "Ya existe un ingrediente con ese nombre.",
      };
    }
    return { ok: false as const, error: error.message };
  }

  revalidatePath("/inventario");
  return { ok: true as const, ingrediente: data };
}

export async function updateIngrediente(input: unknown) {
  const parsed = UpdateIngredienteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Datos inválidos." };
  }
  const { profile, supabase } = await requireAdmin();

  const d = parsed.data;
  const byPack = d.packCostCop != null && d.packQty != null;
  const costCop = byPack ? unitCostFromPack(d.packCostCop!, d.packQty!) : d.costCop;

  const { data, error } = await supabase
    .from("ingredientes")
    .update({
      category_id: d.categoryId,
      name: d.name,
      unit: d.unit,
      unit2: d.unit2 ?? null,
      conversion_factor: d.conversionFactor ?? null,
      stock_min: d.stockMin,
      merma_pct: d.mermaPct,
      cost_cop: costCop,
      pack_cost_cop: byPack ? d.packCostCop : null,
      pack_qty: byPack ? d.packQty : null,
    })
    .eq("id", d.id)
    .eq("organization_id", profile.organization_id)
    .select(
      "id, organization_id, category_id, name, unit, unit2, conversion_factor, stock_current, stock_min, merma_pct, cost_cop, pack_cost_cop, pack_qty, archived",
    )
    .single();

  if (error) {
    console.error("[updateIngrediente]", error);
    if (error.code === "23505") {
      return {
        ok: false as const,
        error: "Ya existe un ingrediente con ese nombre.",
      };
    }
    return { ok: false as const, error: error.message };
  }

  // A changed unit cost must flow into every producto that uses this
  // ingrediente — receta edits recompute on their own, but editing the
  // ingrediente here otherwise wouldn't cascade. Best-effort: the update
  // already succeeded, so don't fail the whole action if the rollup hiccups.
  try {
    await recomputeProductosForIngrediente(
      supabase,
      profile.organization_id,
      d.id,
    );
  } catch (err) {
    console.error("[updateIngrediente] cost cascade failed:", err);
  }

  revalidatePath("/inventario");
  revalidatePath("/recetas");
  revalidatePath("/catalogo");
  return { ok: true as const, ingrediente: data };
}

export async function deleteIngrediente(input: unknown) {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Datos inválidos." };
  }
  const { profile, supabase } = await requireAdmin();

  // Soft-delete via archived=true so the audit log (movements + recetas
  // referencing this ingrediente) stays intact.
  const { error } = await supabase
    .from("ingredientes")
    .update({ archived: true })
    .eq("id", parsed.data.id)
    .eq("organization_id", profile.organization_id);

  if (error) {
    console.error("[deleteIngrediente]", error);
    return { ok: false as const, error: error.message };
  }

  revalidatePath("/inventario");
  return { ok: true as const };
}

// ─────────────────────────────────────────────────────────────────────
// Stock mutations — write to ingrediente_movements; the BEFORE INSERT
// trigger atomically updates ingredientes.stock_current and stamps
// balance_after, so the application never writes stock_current directly.
// ─────────────────────────────────────────────────────────────────────

export async function adjustIngredienteStock(input: unknown) {
  const parsed = AdjustStockSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Datos inválidos." };
  }
  const { user, profile, supabase } = await requireAdmin();

  // Need the current stock to compute the delta (movements are signed).
  const { data: current, error: readErr } = await supabase
    .from("ingredientes")
    .select("id, stock_current")
    .eq("id", parsed.data.id)
    .eq("organization_id", profile.organization_id)
    .maybeSingle();

  if (readErr || !current) {
    return { ok: false as const, error: "Ingrediente no encontrado." };
  }

  const delta = Number(parsed.data.newStock) - Number(current.stock_current);
  if (delta === 0) {
    return {
      ok: true as const,
      ingrediente: { id: current.id, stock_current: current.stock_current },
    };
  }

  const { data, error } = await supabase
    .from("ingrediente_movements")
    .insert({
      organization_id: profile.organization_id,
      ingrediente_id: parsed.data.id,
      type: "ajuste",
      delta,
      note: parsed.data.note ?? "Ajuste manual",
      created_by: user.id,
    })
    .select("balance_after")
    .single();

  if (error) {
    console.error("[adjustIngredienteStock]", error);
    return { ok: false as const, error: error.message };
  }

  revalidatePath("/inventario");
  return {
    ok: true as const,
    ingrediente: { id: current.id, stock_current: data!.balance_after },
  };
}

export async function applyConteo(input: unknown) {
  const parsed = ApplyConteoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Datos inválidos." };
  }
  const { user, profile, supabase } = await requireAdmin();

  // Read the current stocks for every ingrediente we're counting so we
  // can build signed deltas (only the trigger sees the final balance).
  const ids = parsed.data.counts.map((c) => c.id);
  const { data: rows, error: readErr } = await supabase
    .from("ingredientes")
    .select("id, stock_current")
    .in("id", ids)
    .eq("organization_id", profile.organization_id);
  if (readErr) {
    return { ok: false as const, error: readErr.message };
  }
  const stockById = new Map<string, number>(
    (rows ?? []).map((r) => [r.id, Number(r.stock_current)]),
  );

  const movements: {
    organization_id: string;
    ingrediente_id: string;
    type: "ajuste";
    delta: number;
    note: string;
    created_by: string;
  }[] = [];

  for (const c of parsed.data.counts) {
    const current = stockById.get(c.id);
    if (current === undefined) continue; // not in our org — skip silently
    const delta = Number(c.physicalCount) - current;
    if (delta === 0) continue;
    movements.push({
      organization_id: profile.organization_id,
      ingrediente_id: c.id,
      type: "ajuste",
      delta,
      note: "Conteo físico",
      created_by: user.id,
    });
  }

  if (movements.length === 0) {
    return { ok: true as const, updated: [] };
  }

  // Single INSERT is one statement and therefore atomic — if any trigger
  // raises, the whole conteo rolls back. Returning balance_after lets the
  // client patch its local row state without a re-fetch.
  const { data, error } = await supabase
    .from("ingrediente_movements")
    .insert(movements)
    .select("ingrediente_id, balance_after");

  if (error) {
    console.error("[applyConteo]", error);
    return { ok: false as const, error: error.message };
  }

  revalidatePath("/inventario");
  return {
    ok: true as const,
    updated: (data ?? []).map((r) => ({
      id: r.ingrediente_id,
      stock_current: r.balance_after,
    })),
  };
}
