"use server";

import { z } from "zod";
import { leerCodigo, normalizarInstagram, type EstadoEnlace } from "@/lib/calificaciones/calificaciones";
import { enviarCalificacion } from "@/lib/calificaciones/calificaciones-db";

const Schema = z.object({
  codigo: z.string().max(20),
  estrellas: z.coerce.number().int().min(1).max(5),
  sugerencia: z.string().trim().max(500).optional(),
  instagram: z.string().trim().max(80).optional(),
});

export type CalificarResult =
  | { ok: true; puntos: number; total: number | null }
  | { ok: false; error: string; estado?: EstadoEnlace };

/**
 * The customer's answer to the QR on their cup. Public: the code in the URL
 * is the only credential, and it is good for one answer.
 */
export async function calificar(input: unknown): Promise<CalificarResult> {
  const parsed = Schema.safeParse(input);
  const codigo = parsed.success ? leerCodigo(parsed.data.codigo) : null;
  if (!parsed.success || !codigo) return { ok: false, error: "Marca cuántas estrellas nos das." };
  const raw = parsed.data.instagram ?? "";
  const instagram = raw ? normalizarInstagram(raw) : null;
  if (raw && !instagram) return { ok: false, error: "Ese usuario de Instagram no parece válido. Revísalo o déjalo vacío." };
  const res = await enviarCalificacion(codigo, { estrellas: parsed.data.estrellas, sugerencia: parsed.data.sugerencia || null, instagram });
  if (!res.ok) return { ok: false, estado: res.estado, error: res.estado === "usado" ? "Esta calificación ya fue enviada." : "Este enlace ya no está activo." };
  return res;
}
