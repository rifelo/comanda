import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ModGroup, ModGroupType, ModOption } from "@/lib/modificadores";

/** All modifier groups (with their options) for an organization. */
export async function getModificadores(
  organizationId: string,
): Promise<ModGroup[]> {
  const supabase = await createSupabaseServerClient();
  const [{ data: groups }, { data: options }] = await Promise.all([
    supabase
      .from("modifier_groups")
      .select("id, name, type, required, position")
      .eq("organization_id", organizationId)
      .order("position")
      .order("name"),
    supabase
      .from("modifier_options")
      .select("id, group_id, name, price_delta_cop, available, position")
      .eq("organization_id", organizationId)
      .order("position")
      .order("name"),
  ]);

  const byGroup = new Map<string, ModOption[]>();
  for (const o of options ?? []) {
    const row: ModOption = {
      id: o.id as string,
      name: o.name as string,
      price_delta_cop: Number(o.price_delta_cop),
      available: o.available as boolean,
    };
    const arr = byGroup.get(o.group_id as string) ?? [];
    arr.push(row);
    byGroup.set(o.group_id as string, arr);
  }

  return (groups ?? []).map((g) => ({
    id: g.id as string,
    name: g.name as string,
    type: g.type as ModGroupType,
    required: g.required as boolean,
    options: byGroup.get(g.id as string) ?? [],
  }));
}
