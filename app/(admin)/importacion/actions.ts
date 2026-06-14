"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { validateRows, type ImportType } from "@/lib/importacion";

const InputSchema = z.object({
  type: z.enum(["productos", "ingredientes"]),
  records: z.array(z.record(z.string(), z.string())).max(5000),
});

/**
 * Bulk import productos or ingredientes from parsed CSV records. The rows are
 * re-validated server-side (never trust the client) and upserted on their
 * natural key (productos: org+sku, ingredientes: org+name), so re-importing
 * updates existing rows instead of failing.
 */
export async function importRows(input: unknown) {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos inválidos." };
  const type = parsed.data.type as ImportType;
  const { profile, supabase } = await requireAdmin();
  const orgId = profile.organization_id;

  const validated = validateRows(type, parsed.data.records);
  const valid = validated.filter((r) => r.data !== null);
  const invalid = validated.length - valid.length;
  if (valid.length === 0) {
    return { ok: true, imported: 0, skipped: invalid };
  }

  if (type === "productos") {
    const rows = valid.map((r) => ({
      organization_id: orgId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(r.data as any),
    }));
    const { error } = await supabase
      .from("productos")
      .upsert(rows, { onConflict: "organization_id,sku" });
    if (error) return { error: error.message };
    revalidatePath("/catalogo");
  } else {
    const rows = valid.map((r) => ({
      organization_id: orgId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(r.data as any),
    }));
    const { error } = await supabase
      .from("ingredientes")
      .upsert(rows, { onConflict: "organization_id,name" });
    if (error) return { error: error.message };
    revalidatePath("/inventario");
  }

  revalidatePath("/importacion");
  return { ok: true, imported: valid.length, skipped: invalid };
}
