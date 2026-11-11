import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * The end-of-shift count is retired (2026-11-11): the inventory assistant
 * decides what to count and when, and the team verifies it from Inventario.
 */
export default function ConteoPage() {
  redirect("/turno/inventario");
}
