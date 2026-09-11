import type { Metadata } from "next";
import { loadPosContext } from "@/lib/pos/server";
import { PosTerminal } from "./pos-terminal";
import { PosRegister } from "./pos-register";

// The register installs as its own desktop app: this segment swaps the root
// (staff, phone-first) manifest for app/pos/manifest.ts.
export const metadata: Metadata = {
  title: "Punto de venta · comanda",
  applicationName: "comanda POS",
  manifest: "/pos/manifest.webmanifest",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
};
export const dynamic = "force-dynamic";

/**
 * Punto de venta (POS) + asistente de IA. Full-screen terminal that inherits
 * only the root layout (theme + fonts) — no admin sidebar or staff chrome.
 *
 * Reachable without a user session (see lib/supabase/middleware.ts). The
 * context resolves, in order: a paired POS device (cookie set by a
 * registration code), then a signed-in org member. With neither, the pairing
 * screen is shown.
 */
export default async function PosPage() {
  const ctx = await loadPosContext();
  if (!ctx) return <PosRegister />;
  return (
    <PosTerminal
      catalog={ctx.catalog}
      station={ctx.station}
      mode={ctx.actor.kind}
    />
  );
}
