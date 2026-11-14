"use server";

import { z } from "zod";
import { leerCodigo, normalizarInstagram, type EstadoEnlace } from "@/lib/calificaciones/calificaciones";
import { enviarCalificacion } from "@/lib/calificaciones/calificaciones-db";
import type { Registro } from "@/lib/clientes/mi-payo";
import { registroDeEscaneo } from "@/lib/clientes/mi-payo-db";
import { marcarVerificado, recordarInstagram } from "@/lib/clientes/sesion";

const Schema = z.object({
  codigo: z.string().max(20),
  /** Optional: the points never depend on the review (then the @ is required). */
  estrellas: z.coerce.number().int().min(1).max(5).optional(),
  sugerencia: z.string().trim().max(500).optional(),
  instagram: z.string().trim().max(80).optional(),
});

export type CalificarResult =
  | { ok: true; puntos: number; total: number | null; bienvenida: number; registro: Registro | null }
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
  const estrellas = parsed.data.estrellas ?? null;
  if (estrellas === null && !instagram) return { ok: false, error: "Escribe tu usuario de Instagram para sumar tus puntos." };
  const res = await enviarCalificacion(codigo, { estrellas, sugerencia: parsed.data.sugerencia || null, instagram });
  if (!res.ok) return { ok: false, estado: res.estado, error: res.estado === "usado" ? "Esta calificación ya fue enviada." : "Este enlace ya no está activo." };
  if (!instagram) return { ...res, registro: null };
  // This phone now opens «Mi Pa'Yo» as this @ (cafepayo.com/puntos).
  await recordarInstagram(instagram);
  // A real cup QR paid to this @ from this phone: it may redeem rewards (premios).
  if (res.total !== null) await marcarVerificado(instagram);
  const registro = res.puntos > 0 && res.total !== null ? await registroDeEscaneo(codigo, instagram, res.total, res.bienvenida) : null;
  return { ...res, registro };
}
