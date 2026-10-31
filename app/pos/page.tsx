import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { loadPosContext } from "@/lib/pos/server";
import { PosTerminal } from "./pos-terminal";

// The register installs as its own desktop app: this segment swaps the root
// (staff, phone-first) manifest for app/pos/manifest.webmanifest/route.ts.
export const metadata: Metadata = {
  title: "Punto de venta · comanda",
  applicationName: "comanda POS",
  manifest: "/pos/manifest.webmanifest",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};
export const dynamic = "force-dynamic";

/**
 * Punto de venta (POS) + asistente de IA. Full-screen terminal that inherits
 * only the root layout (theme + fonts) — no admin sidebar or staff chrome.
 *
 * Reachable without a session in the proxy (see lib/supabase/middleware.ts);
 * this page decides. A paired device (cookie) fixes the sede and still needs
 * a *person*: with nobody signed in it goes to /login, which on a paired
 * device shows the team's tiles and comes back here. Without a device, a
 * signed-in member uses their account; with neither, /login too (pairing
 * now lives at /emparejar).
 */
export default async function PosPage() {
  const ctx = await loadPosContext();
  if (!ctx) redirect("/login?next=/pos");
  if (ctx.requiresPerson) {
    // Someone from another org is signed in here: show the login anyway
    // (switch=1) instead of bouncing between /login and /pos.
    if (ctx.wrongPerson) {
      redirect(`/login?next=/pos&switch=1&error=${encodeURIComponent(`Esta cuenta no pertenece a ${ctx.catalog.orgName}. Entra con tu usuario.`)}`);
    }
    redirect("/login?next=/pos");
  }
  const person = ctx.person && { id: ctx.person.profileId, name: ctx.person.fullName, role: ctx.person.role };
  return (
    <PosTerminal
      catalog={ctx.catalog}
      station={ctx.station}
      organizationId={ctx.organizationId}
      mode={ctx.actor.kind}
      person={person}
    />
  );
}
