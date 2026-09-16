"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { todayInTz } from "@/lib/utils";

const Schema = z.object({ template_id: z.string().uuid() });

/**
 * "Llenar turno" for the owner/admin: make sure today's shift instance of the
 * turno exists (the nightly cron may not have created it yet) and open the
 * checklist at /shift/[id] — the same screen staff use; completions are
 * recorded under the admin's own profile (RLS: completed_by = auth.uid()).
 * A <form action> + redirect, never router.push inside a transition.
 */
export async function llenarTurno(formData: FormData): Promise<void> {
  const parsed = Schema.safeParse({ template_id: formData.get("template_id") });
  if (!parsed.success) redirect("/hoy");
  const { supabase } = await requireAdmin();
  const sede = await getActiveSede();
  if (!sede) redirect("/hoy");
  const date = todayInTz(sede.tz);

  const { data: tpl } = await supabase
    .from("checklist_templates")
    .select("id")
    .eq("id", parsed.data.template_id)
    .eq("restaurant_id", sede.id)
    .maybeSingle();
  if (!tpl) redirect("/hoy");

  await supabase
    .from("shift_instances")
    .upsert(
      { restaurant_id: sede.id, template_id: tpl.id, date },
      { onConflict: "restaurant_id,template_id,date", ignoreDuplicates: true },
    );
  const { data: inst } = await supabase
    .from("shift_instances")
    .select("id")
    .eq("restaurant_id", sede.id)
    .eq("template_id", tpl.id)
    .eq("date", date)
    .maybeSingle();
  if (!inst) redirect("/hoy");
  redirect(`/shift/${inst.id}`);
}
