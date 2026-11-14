import "server-only";
import { cookies } from "next/headers";
import { normalizarInstagram } from "@/lib/calificaciones/calificaciones";
import { firmar } from "./premios-codigo";

/**
 * «Mi Pa'Yo» remembers the @ typed on this phone (owner, 2026-11-08: typing
 * the @ is enough, no verification). Not a credential: it only picks whose
 * points the page shows.
 */
const COOKIE = "pym_ig";

export async function instagramDeSesion(): Promise<string | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  return raw ? normalizarInstagram(raw) : null;
}

const OPCIONES = { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" } as const;

/** Only from a server action or route handler. */
export async function recordarInstagram(instagram: string | null): Promise<void> {
  const jar = await cookies();
  if (!instagram) jar.delete(COOKIE);
  else jar.set(COOKIE, instagram, OPCIONES);
}

/**
 * Redeeming a reward needs more than a typed @: the phone must have scanned
 * one of that @'s cups (a physical QR it could only have from a purchase).
 * The scan signs the @ into this cookie; Mi Pa'Yo shows the redemption code
 * only when it matches the remembered @.
 */
const VERIFICADO = "pym_v";

/** Only from a server action or route handler: after a cup's QR paid points to `instagram`. */
export async function marcarVerificado(instagram: string): Promise<void> {
  (await cookies()).set(VERIFICADO, `${instagram}.${firmar(`verificado:${instagram}`)}`, OPCIONES);
}

export async function verificadoDeSesion(instagram: string): Promise<boolean> {
  const raw = (await cookies()).get(VERIFICADO)?.value ?? "";
  const i = raw.lastIndexOf(".");
  if (i < 1 || raw.slice(0, i) !== instagram) return false;
  return raw.slice(i + 1) === firmar(`verificado:${instagram}`);
}
