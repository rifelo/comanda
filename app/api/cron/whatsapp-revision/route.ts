import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { revisarDia } from "@/lib/whatsapp/revision";
import { todayInTz } from "@/lib/utils";

export const maxDuration = 300;

/**
 * Nightly review of the WhatsApp agent (23:50 Bogotá): for every org with a
 * WhatsApp number, read the day's conversations and propose lessons for the
 * owner to approve in /whatsapp/aprendizajes. `?fecha=YYYY-MM-DD` re-runs a
 * given day. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: NextRequest) {
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = createSupabaseAdminClient();
  const { data: numeros, error } = await db.from("whatsapp_numeros").select("organization_id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const fechaParam = req.nextUrl.searchParams.get("fecha");
  const fecha = fechaParam && /^\d{4}-\d{2}-\d{2}$/.test(fechaParam) ? fechaParam : todayInTz("America/Bogota");
  const resultados = [];
  for (const orgId of new Set((numeros ?? []).map((n) => n.organization_id as string))) {
    try {
      resultados.push({ orgId, ...(await revisarDia(db, orgId, fecha)) });
    } catch (e) {
      console.error("[cron whatsapp-revision]", orgId, e);
      resultados.push({ orgId, error: String(e) });
    }
  }
  return NextResponse.json({ fecha, resultados });
}
