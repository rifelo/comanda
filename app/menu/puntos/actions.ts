"use server";

import { redirect } from "next/navigation";
import { normalizarInstagram } from "@/lib/calificaciones/calificaciones";
import { recordarInstagram } from "@/lib/clientes/sesion";

export type EntrarState = { error: string | null; valor: string };

/**
 * «Ver mis puntos»: remember the @ on this phone and open the app. Public —
 * the owner chose that the typed @ is enough (2026-11-08). A handle that never
 * earned points still opens, with an empty home that says how to start.
 */
export async function entrar(_prev: EntrarState, form: FormData): Promise<EntrarState> {
  const raw = String(form.get("instagram") ?? "").trim().slice(0, 80);
  const instagram = normalizarInstagram(raw);
  if (!instagram) return { error: raw ? "Ese usuario de Instagram no parece válido. Revísalo e intenta de nuevo." : "Escribe tu usuario de Instagram.", valor: raw };
  await recordarInstagram(instagram);
  redirect("/menu/puntos");
}

export async function salir(): Promise<void> {
  await recordarInstagram(null);
  redirect("/menu/puntos");
}
