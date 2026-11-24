import { NextResponse, type NextRequest } from "next/server";
import { normalizarOrigen } from "@/lib/menu/origenes";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * cafepayo.com/desde/<origen>: the address behind the QR of a printed piece
 * (the poster at ESE Salud Yopal). Counts the scan and opens the menu, which
 * shows the order button of that place. Never fails the visit over the count.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ origen: string }> }) {
  const origen = normalizarOrigen((await params).origen);
  const destino = request.nextUrl.clone();
  destino.pathname = "/menu";
  destino.search = origen ? `?desde=${origen}` : "";
  if (origen) {
    try {
      const { error } = await createSupabaseAdminClient()
        .from("menu_visitas")
        .insert({ origen, user_agent: (request.headers.get("user-agent") ?? "").slice(0, 300) || null });
      if (error) console.error("[menu/desde] visita:", error);
    } catch (e) {
      console.error("[menu/desde] visita:", e);
    }
  }
  return NextResponse.redirect(destino, 307);
}
