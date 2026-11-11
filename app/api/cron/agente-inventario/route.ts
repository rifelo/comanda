import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { planificarDia, sumarDias } from "@/lib/inventario/agente/db";
import { todayInTz } from "@/lib/utils";

/**
 * Nightly run of the inventory assistant (23:30 Bogotá): for every org with
 * inventory, plan tomorrow's verification tasks from today's sales. The
 * tablet also plans on demand when it opens Inventario and nothing was
 * planned for the day, so a missed run only delays, never loses, the checks.
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: NextRequest) {
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = createSupabaseAdminClient();
  const { data: sedes, error } = await db.from("restaurants").select("id, organization_id, timezone").order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // One plan per org, attached to its first sede.
  const porOrg = new Map<string, { id: string; tz: string }>();
  for (const s of sedes ?? []) {
    if (!porOrg.has(s.organization_id as string)) porOrg.set(s.organization_id as string, { id: s.id as string, tz: (s.timezone as string) || "America/Bogota" });
  }
  const resultados = [];
  for (const [orgId, sede] of porOrg) {
    const { count } = await db.from("ingredientes").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("archived", false);
    if (!count) continue;
    // At 23:30 local the sales of "today" are complete: plan for tomorrow with them.
    const hoy = todayInTz(sede.tz);
    try {
      resultados.push({ orgId, ...(await planificarDia(db, orgId, { fecha: sumarDias(hoy, 1), restaurantId: sede.id, diaVentas: hoy })) });
    } catch (e) {
      console.error("[cron agente-inventario]", orgId, e);
      resultados.push({ orgId, error: String(e) });
    }
  }
  return NextResponse.json({ resultados });
}
