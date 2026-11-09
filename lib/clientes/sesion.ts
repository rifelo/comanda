import "server-only";
import { cookies } from "next/headers";
import { normalizarInstagram } from "@/lib/calificaciones/calificaciones";

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

/** Only from a server action or route handler. */
export async function recordarInstagram(instagram: string | null): Promise<void> {
  const jar = await cookies();
  if (!instagram) jar.delete(COOKIE);
  else jar.set(COOKIE, instagram, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
}
