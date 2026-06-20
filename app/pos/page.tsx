import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { PosTerminal } from "./pos-terminal";

export const metadata: Metadata = {
  title: "Punto de venta · comanda",
};

/**
 * Punto de venta (POS) + asistente de IA. Full-screen terminal that inherits
 * only the root layout (theme + fonts) — no admin sidebar or staff chrome.
 * Staff-operated, so it's gated behind requireUser().
 */
export default async function PosPage() {
  await requireUser();
  return <PosTerminal />;
}
