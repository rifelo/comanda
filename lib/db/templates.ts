import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ChecklistTemplate, TemplateTask } from "@/lib/types";

export async function getTemplate(templateId: string) {
  const supabase = await createSupabaseServerClient();
  const [{ data: template }, { data: tasks }] = await Promise.all([
    supabase
      .from("checklist_templates")
      .select("*")
      .eq("id", templateId)
      .single<ChecklistTemplate>(),
    supabase
      .from("template_tasks")
      .select("*")
      .eq("template_id", templateId)
      .order("order_index"),
  ]);
  if (!template) return null;
  return { template, tasks: (tasks ?? []) as TemplateTask[] };
}

export async function listTemplatesForRestaurant(restaurantId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("checklist_templates")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("shift");
  return (data ?? []) as ChecklistTemplate[];
}
