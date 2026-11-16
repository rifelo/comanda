"use server";

import { normalizarInstagram } from "@/lib/calificaciones/calificaciones";
import { clienteDeInstagram, vincularTelefono, type ResultadoVinculo } from "@/lib/clientes/mi-payo-whatsapp";
import { instagramDeSesion, recordarInstagram, verificadoDeSesion } from "@/lib/clientes/sesion";
import { leerTokenVincular, mensajeTokenVincular } from "@/lib/clientes/telefono";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type VincularState = { error: string | null; valor: string; listo: string | null };

function mensajeDe(r: Extract<ResultadoVinculo, { ok: false }>): string {
  switch (r.motivo) {
    case "telefono_de_otro":
      return `Este WhatsApp ya está vinculado con @${r.instagram}. Si no eres tú, escríbenos y lo revisamos.`;
    case "otro_telefono":
      return `@${r.instagram} ya tiene vinculado otro WhatsApp${r.fin ? ` (${r.fin})` : ""}. Para cambiarlo, abre este enlace en el celular con el que escaneas tus vasos.`;
    case "telefono_invalido":
      return "Este enlace no es válido. Pídenos uno nuevo por WhatsApp.";
    default:
      return "No pudimos vincularlo. Intenta de nuevo en un momento.";
  }
}

/**
 * Link the WhatsApp number in the signed link (the agent sent it) to an @.
 * Public: the link is the credential for the number, good for 24 h.
 * - `modo=verificado`: the @ this phone proved by scanning one of its cups
 *   (the `pym_v` cookie); it may replace a number the @ already had.
 * - otherwise the typed @ (created with no points when new); it never
 *   replaces a number, never takes one another @ holds.
 */
export async function vincular(_prev: VincularState, form: FormData): Promise<VincularState> {
  const t = leerTokenVincular(String(form.get("t") ?? ""));
  const raw = String(form.get("instagram") ?? "").trim().slice(0, 80);
  if (!t.ok) return { error: mensajeTokenVincular(t.motivo), valor: raw, listo: null };
  const { orgId, telefono } = t.token;
  const db = createSupabaseAdminClient();

  let instagram: string | null;
  let reemplazar = false;
  if (form.get("modo") === "verificado") {
    instagram = await instagramDeSesion();
    if (!instagram || !(await verificadoDeSesion(instagram))) return { error: "Escribe tu usuario de Instagram para vincularlo.", valor: "", listo: null };
    reemplazar = true;
  } else {
    instagram = normalizarInstagram(raw);
    if (!instagram) return { error: raw ? "Ese usuario de Instagram no parece válido. Revísalo e intenta de nuevo." : "Escribe tu usuario de Instagram.", valor: raw, listo: null };
  }

  const clienteId = await clienteDeInstagram(db, orgId, instagram);
  if (!clienteId) return { error: "No pudimos vincularlo. Intenta de nuevo en un momento.", valor: raw, listo: null };
  const r = await vincularTelefono(db, { orgId, clienteId, telefono, origen: "enlace", reemplazar });
  if (!r.ok) return { error: mensajeDe(r), valor: raw, listo: null };
  // This phone now opens Mi Pa'Yo as this @, like «Ver mis puntos».
  if (!reemplazar) await recordarInstagram(instagram);
  return { error: null, valor: raw, listo: r.instagram };
}
