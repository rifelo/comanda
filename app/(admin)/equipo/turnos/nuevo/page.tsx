import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { listPuestos } from "@/lib/db/puestos";
import { ShiftForm } from "../_components/shift-form";

export const dynamic = "force-dynamic";

export default async function NuevoTurnoPage() {
  await requireAdmin();
  const sede = await getActiveSede();
  const puestoOptions = sede ? await listPuestos(sede.id) : [];
  return <ShiftForm puestoOptions={puestoOptions} />;
}
