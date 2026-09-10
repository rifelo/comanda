"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import {
  formatCode,
  generateRegistrationCode,
} from "@/lib/pos/devices";

// Result shapes (`"use server"` files cannot export type-only declarations):
//   crearCodigoRegistro → { ok: true; code: string; expiresAt: string } | { error: string }
//   anularCodigo        → { ok: true } | { error: string }
//   desvincularDispositivo / renombrarDispositivo → { ok: true } | { error: string }

const CrearCodigoSchema = z.object({
  label: z.string().max(60).optional(),
});

/**
 * Mint a one-time POS registration code for the admin's org (24h expiry).
 * Retries on the (astronomically unlikely) unique-code collision.
 */
export async function crearCodigoRegistro(input: { label?: string }) {
  const parsed = CrearCodigoSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos inválidos." };

  const { profile, supabase } = await requireAdmin();
  const sede = await getActiveSede();
  const label = parsed.data.label?.trim() || null;

  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateRegistrationCode();
    const { data, error } = await supabase
      .from("pos_registration_codes")
      .insert({
        organization_id: profile.organization_id,
        restaurant_id: sede?.id ?? null,
        code,
        label,
        created_by: profile.id,
      })
      .select("code, expires_at")
      .single();
    if (!error && data) {
      revalidatePath("/configuracion/pos");
      return {
        ok: true as const,
        code: formatCode(data.code as string),
        expiresAt: data.expires_at as string,
      };
    }
    if (error && error.code !== "23505") return { error: error.message };
  }
  return { error: "No se pudo generar el código. Intenta de nuevo." };
}

export async function anularCodigo(input: { id: string }) {
  if (!z.string().uuid().safeParse(input.id).success) {
    return { error: "Datos inválidos." };
  }
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("pos_registration_codes")
    .update({ cancelled_at: new Date().toISOString() })
    .eq("id", input.id)
    .is("used_at", null);
  if (error) return { error: error.message };
  revalidatePath("/configuracion/pos");
  return { ok: true };
}

/** Revoke a paired device. Its cookie stops resolving on the next request. */
export async function desvincularDispositivo(input: { id: string }) {
  if (!z.string().uuid().safeParse(input.id).success) {
    return { error: "Datos inválidos." };
  }
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("pos_devices")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", input.id);
  if (error) return { error: error.message };
  revalidatePath("/configuracion/pos");
  return { ok: true };
}

export async function renombrarDispositivo(input: { id: string; name: string }) {
  const parsed = z
    .object({ id: z.string().uuid(), name: z.string().min(1).max(60) })
    .safeParse(input);
  if (!parsed.success) return { error: "Datos inválidos." };
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("pos_devices")
    .update({ name: parsed.data.name.trim() })
    .eq("id", parsed.data.id);
  if (error) return { error: error.message };
  revalidatePath("/configuracion/pos");
  return { ok: true };
}
