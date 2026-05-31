import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";

/**
 * Legacy `/shifts/[id]` URL — folded into `/hoy/[date]` by the redesign.
 * Resolve the shift to its business date and bounce; if unresolvable, fall
 * back to the Hoy dashboard.
 */
export default async function AdminShiftRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireAdmin();

  const { data } = await supabase
    .from("shift_instances")
    .select("date")
    .eq("id", id)
    .maybeSingle();

  if (data?.date) redirect(`/hoy/${data.date}`);
  redirect("/hoy");
}
