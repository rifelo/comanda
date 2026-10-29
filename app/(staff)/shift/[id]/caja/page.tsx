import { redirect } from "next/navigation";

/** The arqueo now lives in the Caja module (/turno/caja); old links from the shift screen land there. */
export default function ShiftCajaPage() {
  redirect("/turno/caja");
}
