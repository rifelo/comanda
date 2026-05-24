import { requireAdmin } from "@/lib/auth";
import { listCatalogo, listProductoCategorias } from "@/lib/db/productos";
import { CatalogoClient } from "./catalogo-client";

export const metadata = { title: "Productos · Catálogo · co-manda" };

export default async function CatalogoPage() {
  const { profile, user } = await requireAdmin();
  const [productos, categorias] = await Promise.all([
    listCatalogo({ organizationId: profile.organization_id, userId: user.id }),
    listProductoCategorias({ organizationId: profile.organization_id }),
  ]);
  return <CatalogoClient productos={productos} categorias={categorias} />;
}
