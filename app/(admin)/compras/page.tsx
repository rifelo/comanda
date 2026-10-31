import { redirect } from "next/navigation";

// Compras live in Inventario → Pedidos (docs/redesign/PLAN.md §2.4).
export default function ComprasPage() {
  redirect("/inventario/pedidos");
}
