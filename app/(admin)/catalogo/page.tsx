import { redirect } from "next/navigation";

// Catálogo + Recetas are one list now (docs/redesign/PLAN.md §2.4).
export default function CatalogoPage() {
  redirect("/productos");
}
