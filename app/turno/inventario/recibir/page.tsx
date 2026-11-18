import { redirect } from "next/navigation";

/** «Pedidos por llegar» moved to its own tablet tab. */
export default function RecibirRedirect() {
  redirect("/turno/pedidos");
}
