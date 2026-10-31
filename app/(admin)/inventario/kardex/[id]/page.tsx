import { redirect } from "next/navigation";

// The kardex lives in the insumo's page now (docs/redesign/PLAN.md §2.4); the period query is kept.
export default async function KardexPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) for (const x of Array.isArray(v) ? v : v != null ? [v] : []) q.append(k, x);
  const qs = q.toString();
  redirect(`/inventario/${encodeURIComponent(id)}${qs ? `?${qs}` : ""}`);
}
