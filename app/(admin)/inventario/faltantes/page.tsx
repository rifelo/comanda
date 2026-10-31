import { redirect } from "next/navigation";

// The team's faltantes live in Inventario → «Se acaba» (docs/redesign/PLAN.md §2.4).
// faltantes/actions.ts stays: components/inventario/faltantes-card.tsx uses it.
export default function FaltantesPage() {
  redirect("/inventario?vista=acabando");
}
