import type { Metadata } from "next";
import { loadPosContext } from "@/lib/pos/server";
import { PosTerminal } from "./pos-terminal";
import { PosRegister } from "./pos-register";

export const metadata: Metadata = {
  title: "Punto de venta · comanda",
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
