"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { revisarDia } from "@/lib/whatsapp/revision";
import { todayInTz } from "@/lib/utils";

export type AccionResultado = { ok: true; mensaje?: string } | { ok: false; error: string };

const Decision = z.object({
  id: z.string().uuid(),
  estado: z.enum(["aprobada", "descartada", "retirada"]),
  texto: z.string().trim().min(5).max(400).optional(),
});

/** Approve (optionally edited), discard, or withdraw a lesson. */
export async function decidirLeccion(input: unknown): Promise<AccionResultado> {
  const p = Decision.safeParse(input);
  if (!p.success) return { ok: false, error: "La lección debe tener entre 5 y 400 caracteres." };
  const { profile, supabase } = await requireAdmin();
  const { error } = await supabase
    .from("agente_lecciones")
    .update({ estado: p.data.estado, decidida_at: new Date().toISOString(), ...(p.data.texto ? { texto: p.data.texto } : {}) })
    .eq("id", p.data.id)
    .eq("organization_id", profile.organization_id);
  if (error) return { ok: false, error: "No se pudo guardar." };
  revalidatePath("/whatsapp/aprendizajes");
  return { ok: true };
}

/** Run today's review now instead of waiting for the night. */
export async function revisarAhora(): Promise<AccionResultado> {
  const { profile } = await requireAdmin();
  try {
    const r = await revisarDia(createSupabaseAdminClient(), profile.organization_id, todayInTz("America/Bogota"));
    revalidatePath("/whatsapp/aprendizajes");
    return { ok: true, mensaje: r.propuestas ? `${r.propuestas} lecciones nuevas para revisar.` : "Revisado: sin lecciones nuevas." };
  } catch (e) {
    console.error("[aprendizajes] revisar ahora:", e);
    return { ok: false, error: "No se pudo revisar ahora. Intenta de nuevo en un momento." };
  }
}
