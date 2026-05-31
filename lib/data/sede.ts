import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ThemeName } from "@/lib/types";

/**
 * Single-sede helper.
 *
 * Returns the first restaurant the current user belongs to (admins see all
 * restaurants in their org via RLS; we take the first). The redesign collapsed
 * the multi-sede dashboard into one — every Hoy / Turnos / Productos screen
 * + the staff layout calls this; if `null`, callers fall back to the literal
 * string "Daniel's Burger".
 *
 * 0009 extended this with logo_url / currency / theme so the layout footer +
 * Configuración → Sede / Preferencias can read/write them from a single
 * request. Old callers that only need `id/name/tz` keep working — they're
 * the same field names.
 */
export type ActiveSede = {
  id: string;
  name: string;
  tz: string;
  logo_url: string | null;
  currency: string;
  theme: ThemeName;
};

const THEMES: ThemeName[] = ["papel", "sepia", "carbon", "indigo", "rojo"];
function isTheme(value: unknown): value is ThemeName {
  return typeof value === "string" && (THEMES as string[]).includes(value);
}

export async function getActiveSede(): Promise<ActiveSede | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("restaurants")
    .select("id, name, timezone, logo_url, currency, theme")
    .order("name")
    .limit(1);

  if (error || !data || data.length === 0) return null;
  const r = data[0] as {
    id: string;
    name: string | null;
    timezone: string | null;
    logo_url: string | null;
    currency: string | null;
    theme: string | null;
  };
  return {
    id: r.id,
    name: r.name ?? "Daniel's Burger",
    tz: r.timezone ?? "America/Bogota",
    logo_url: r.logo_url ?? null,
    currency: r.currency ?? "COP",
    theme: isTheme(r.theme) ? r.theme : "papel",
  };
}
