"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";

// updateSede result (documented for callers — `"use server"` files can only
// export async functions):
//   { ok: true } | { error: string }

const Schema = z.object({
  name: z.string().min(1).max(120),
  logo_url: z.string().nullable(),
  timezone: z.string().min(1).max(60),
  currency: z.string().min(1).max(10),
});

export async function updateSede(input: z.infer<typeof Schema>) {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { error: "Datos inválidos." };

  const sede = await getActiveSede();
  if (!sede) return { error: "Sin sede activa." };

  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("restaurants")
    .update({
      name: parsed.data.name.trim(),
      logo_url: parsed.data.logo_url,
      timezone: parsed.data.timezone.trim(),
      currency: parsed.data.currency.trim(),
    })
    .eq("id", sede.id);
  if (error) return { error: error.message };

  // Sidebar footer is part of the root layout — revalidate from root.
  revalidatePath("/", "layout");
  return { ok: true };
}

// updateRecibo result: { ok: true } | { error: string }
const ReciboSchema = z.object({
  recibo_encabezado: z.string().max(300),
  recibo_pie: z.string().max(200),
  transferencia_llave: z.string().max(80),
  transferencia_titular: z.string().max(80),
  datafono_liquidacion: z.string().max(60),
  /** «600.000», «600000» or "" (no goal). */
  meta_diaria: z.string().max(20),
});

/** What the POS prints on the receipt and shows on the payment pages (organizations). */
export async function updateRecibo(input: z.infer<typeof ReciboSchema>) {
  const parsed = ReciboSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos inválidos (revisa el largo de los textos)." };
  const { supabase, profile } = await requireAdmin();
  const val = (v: string) => v.trim() || null;
  const d = parsed.data;
  const metaDigits = d.meta_diaria.replace(/[^\d]/g, "");
  const meta = metaDigits ? Number(metaDigits) : null;
  if (meta !== null && (meta <= 0 || meta > 1_000_000_000)) return { error: "La meta del día debe ser un valor en pesos mayor que 0." };
  const { error } = await supabase
    .from("organizations")
    .update({
      recibo_encabezado: val(d.recibo_encabezado),
      recibo_pie: val(d.recibo_pie),
      transferencia_llave: val(d.transferencia_llave),
      transferencia_titular: val(d.transferencia_titular),
      datafono_liquidacion: val(d.datafono_liquidacion),
      meta_diaria_cop: meta,
    })
    .eq("id", profile.organization_id);
  if (error) return { error: error.message };
  revalidatePath("/ajustes/sede");
  return { ok: true };
}
