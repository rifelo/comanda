import type { Metadata } from "next";
import { loadPosCatalog } from "@/lib/pos/server";
import { PosTerminal } from "./pos-terminal";

export const metadata: Metadata = {
  title: "Punto de venta · comanda",
};

/**
 * Punto de venta (POS) + asistente de IA. Full-screen terminal that inherits
 * only the root layout (theme + fonts) — no admin sidebar or staff chrome.
 * Staff-operated, so it's gated behind requireUser() (inside loadPosCatalog),
 * which also loads the org's live catalog (productos · combos · modificadores).
 */
export default async function PosPage() {
  const { catalog } = await loadPosCatalog();
  return <PosTerminal catalog={catalog} />;
}
