"use server";

import { z } from "zod";
import { diaDeVisita, normalizarInstagram } from "@/lib/calificaciones/calificaciones";
import { consultarPuntos } from "@/lib/calificaciones/calificaciones-db";
import { menuContent } from "@/lib/menu/data";

const Schema = z.object({ instagram: z.string().trim().min(1).max(80) });

export type PuntosResult =
  | { ok: true; instagram: string; puntos: number; ultimaVisita: string | null }
  | { ok: false; error: string };

/**
 * The customer's points behind their Instagram handle, for the menu's points
 * page. Public, like the rest of the menu: the handle is not verified (nor is
 * it when points are earned), so it only says the balance and the last visit,
 * never what was ordered.
 */
export async function verPuntos(input: unknown): Promise<PuntosResult> {
  const parsed = Schema.safeParse(input);
  const instagram = parsed.success ? normalizarInstagram(parsed.data.instagram) : null;
  if (!instagram) return { ok: false, error: "Ese usuario de Instagram no parece válido. Revísalo e intenta de nuevo." };
  try {
    const c = await consultarPuntos(menuContent.organizationId, instagram);
    return { ok: true, instagram, puntos: c?.puntos ?? 0, ultimaVisita: c ? diaDeVisita(c.ultimaVisita) : null };
  } catch (e) {
    console.error("[verPuntos]", e);
    return { ok: false, error: "No pudimos consultar tus puntos. Revisa tu conexión e intenta de nuevo." };
  }
}
