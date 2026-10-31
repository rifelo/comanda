import { redirect } from "next/navigation";

// /historial → /inventario/movimientos, keeping ?ingrediente / ?dias / ?desde&hasta (docs/redesign/PLAN.md §2.4).
export default async function HistorialPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) for (const x of Array.isArray(v) ? v : v != null ? [v] : []) q.append(k, x);
  const qs = q.toString();
  redirect(`/inventario/movimientos${qs ? `?${qs}` : ""}`);
}
