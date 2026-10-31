import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getProductoFicha } from "@/lib/db/recetas";
import { Ficha, type Tab } from "../_components/ficha";

export const metadata: Metadata = { title: "Producto · Comanda" };
export const dynamic = "force-dynamic";

const TABS: Tab[] = ["datos", "receta", "preparacion", "modificadores"];

/** Ficha of one product. `?tab=receta` opens the recipe (default for products without one). */
export default async function ProductoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ profile, user }, { id }, sp] = await Promise.all([requireAdmin(), params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ficha = await getProductoFicha(profile.organization_id, user.id, id);
  if (!ficha) notFound();
  const tab: Tab = (TABS as string[]).includes(sp.tab ?? "") ? (sp.tab as Tab) : "receta";
  return <Ficha key={`${id}-${tab}`} ficha={ficha} tabInicial={tab} />;
}
