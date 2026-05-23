import { redirect } from "next/navigation";

/** Land on the first section (Catálogo) by default. */
export default function ProductosIndex() {
  redirect("/productos/catalogo");
}
