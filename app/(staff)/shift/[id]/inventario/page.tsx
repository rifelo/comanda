import { redirect } from "next/navigation";

/** Inventory lives in the team app (PLAN §2.4). */
export default function Page() {
  redirect("/turno/inventario");
}
