import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { listProductosView } from "@/lib/db/productos";
import { getCostosPendientes } from "@/lib/db/costos-pendientes";
import { ProductosList, type Filtro } from "./_components/productos-list";

export const metadata: Metadata = { title: "Productos · Comanda" };
export const dynamic = "force-dynamic";

const FILTROS: Filtro[] = ["todos", "recetas", "sin-receta", "revisar", "favoritos"];

/**
 * Productos (Catálogo + Recetas in one list). `?vista=recetas` (where
 * /recetas lands) starts on «Con receta»; `?vista=revisar` on «Bajo 55 %».
 */
export default async function ProductosPage({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  const [{ profile, user, supabase }, sp] = await Promise.all([requireAdmin(), searchParams]);
  const [view, costos] = await Promise.all([
    listProductosView({ organizationId: profile.organization_id, userId: user.id }),
    getCostosPendientes(supabase, profile.organization_id),
  ]);
  const filtro = (FILTROS as string[]).includes(sp.vista ?? "") ? (sp.vista as Filtro) : "todos";
  return <ProductosList key={filtro} view={view} costos={costos} filtroInicial={filtro} />;
}
