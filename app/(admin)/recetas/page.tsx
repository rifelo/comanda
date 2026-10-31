import { redirect } from "next/navigation";

// /recetas → /productos?vista=recetas; /recetas?producto=X → the product's
// ficha on «Receta» (docs/redesign/PLAN.md §2.4).
export default async function RecetasPage({ searchParams }: { searchParams: Promise<{ producto?: string }> }) {
  const { producto } = await searchParams;
  if (producto && /^[0-9a-f-]{36}$/i.test(producto)) redirect(`/productos/${producto}?tab=receta`);
  redirect("/productos?vista=recetas");
}
