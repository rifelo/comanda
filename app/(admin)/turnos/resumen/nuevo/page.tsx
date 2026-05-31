import { requireAdmin } from "@/lib/auth";
import { ShiftForm } from "../_components/shift-form";

export const dynamic = "force-dynamic";

export default async function NuevoTurnoPage() {
  await requireAdmin();
  return <ShiftForm />;
}
