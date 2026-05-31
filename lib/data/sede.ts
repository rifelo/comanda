import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Single-sede helper.
 *
 * Returns the first restaurant the current user belongs to (admins see all
 * restaurants in their org via RLS; we take the first). The redesign collapsed
 * the multi-sede dashboard into one — every Hoy / Turnos / Productos screen
 * + the staff layout calls this; if `null`, callers fall back to the literal
 * string "Daniel's Burger".
 */
export type ActiveSede = {
  id: string;
  name: string;
  tz: string;
};

export async function getActiveSede(): Promise<ActiveSede | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("restaurants")
    .select("id, name, timezone")
    .order("name")
    .limit(1);

  if (error || !data || data.length === 0) return null;
  const r = data[0];
  return {
    id: r.id as string,
    name: (r.name as string) ?? "Daniel's Burger",
    tz: (r.timezone as string) ?? "America/Bogota",
  };
}
