import { redirect } from "next/navigation";

/** Ingresos y salidas now live on Caja's home (/turno/caja). */
export default function MovimientosCajaPage() {
  redirect("/turno/caja");
}
