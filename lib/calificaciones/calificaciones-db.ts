import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { modPairsOf } from "@/lib/pos/consumo";
import { estadoDe, lineasDe, puntosDe, type EstadoEnlace, type ItemCalificado } from "./calificaciones";

// Ratings behind the cup's QR (0049). Everything here runs with the service
// role: the customer's page has no session, and the POS registers links for
// whoever is at the register. Callers pass only what they are entitled to.

interface Linea { name: string; qty: number; unit_price_cop: number; mods: unknown; customer_name: string | null }

async function lineasDeOrden(ordenId: string): Promise<{ orgId: string; viva: boolean; people: string[]; lineas: Linea[] } | null> {
  const db = createSupabaseAdminClient();
  const { data } = await db
    .from("ordenes")
    .select("organization_id, status, customer_names, orden_items(name, qty, unit_price_cop, mods, customer_name, position)")
    .eq("id", ordenId)
    .maybeSingle();
  if (!data) return null;
  const lineas = ((data.orden_items ?? []) as Array<Linea & { position: number }>).sort((a, b) => a.position - b.position);
  return {
    orgId: data.organization_id as string,
    viva: data.status !== "cancelada",
    people: ((data.customer_names as string[] | null) ?? []).map((p) => p.trim()).filter(Boolean),
    lineas: lineas.map((l) => ({ name: l.name, qty: Number(l.qty), unit_price_cop: Number(l.unit_price_cop), mods: l.mods, customer_name: l.customer_name ?? null })),
  };
}

/**
 * Register the links a sale just printed: one row per label, each with what
 * that person asked for. Codes come from the POS; a code that already exists
 * is left alone (a retry of the same sale).
 */
export async function registrarEnlaces(orgId: string, ordenId: string, enlaces: ReadonlyArray<{ codigo: string; customer: string | null }>): Promise<{ ok: boolean }> {
  const orden = await lineasDeOrden(ordenId);
  if (!orden || orden.orgId !== orgId) return { ok: false };
  const rows = enlaces.map((e) => {
    const items: ItemCalificado[] = lineasDe(orden.lineas, e.customer, orden.people).map((l) => ({ name: l.name, qty: l.qty, opciones: modPairsOf(l.mods).map((m) => m.name) }));
    return { organization_id: orgId, codigo: e.codigo, orden_id: ordenId, customer_name: e.customer?.trim() || null, items };
  });
  const db = createSupabaseAdminClient();
  const { error } = await db.from("calificaciones").upsert(rows, { onConflict: "codigo", ignoreDuplicates: true });
  if (error) console.error("[registrarEnlaces]", error);
  return { ok: !error };
}

export interface EnlaceCalificacion {
  estado: EstadoEnlace;
  items: ItemCalificado[];
  /** Points this purchase is worth if an @ is given. */
  puntos: number;
  /** The shop's Instagram handle, for the goodbye. */
  instagram: string | null;
}

async function puntosDeEnlace(row: { orden_id: string | null; customer_name: string | null }): Promise<number> {
  if (!row.orden_id) return 0;
  const orden = await lineasDeOrden(row.orden_id);
  if (!orden || !orden.viva) return 0;
  return puntosDe(lineasDe(orden.lineas, row.customer_name, orden.people));
}

/** What a scanned code is worth right now. Never throws: an unknown code is a state. */
export async function cargarEnlace(codigo: string): Promise<EnlaceCalificacion> {
  const db = createSupabaseAdminClient();
  const { data: row } = await db.from("calificaciones").select("organization_id, orden_id, customer_name, items, usada_at, expira_at").eq("codigo", codigo).maybeSingle();
  if (!row) return { estado: "desconocido", items: [], puntos: 0, instagram: null };
  const [{ data: org }, puntos] = await Promise.all([
    db.from("organizations").select("instagram").eq("id", row.organization_id).maybeSingle(),
    puntosDeEnlace({ orden_id: row.orden_id as string | null, customer_name: row.customer_name as string | null }),
  ]);
  return {
    estado: estadoDe({ usada_at: row.usada_at as string | null, expira_at: row.expira_at as string }),
    items: (row.items as ItemCalificado[] | null) ?? [],
    puntos,
    instagram: ((org?.instagram as string | null) ?? "").replace(/^@/, "").trim() || null,
  };
}

export type EnvioResult =
  | { ok: true; puntos: number; total: number | null }
  | { ok: false; estado: EstadoEnlace };

/**
 * Close a link with its rating. The update only lands on a row that was
 * still open, so a double tap or a second phone cannot rate twice. With a
 * handle, the customer earns the purchase's points (computed here, from the
 * order as it stands) — after the rating is safe, so a points hiccup never
 * loses the stars.
 */
export async function enviarCalificacion(codigo: string, input: { estrellas: number; sugerencia: string | null; instagram: string | null }): Promise<EnvioResult> {
  const db = createSupabaseAdminClient();
  const ahora = new Date().toISOString();
  const { data: cerradas } = await db
    .from("calificaciones")
    .update({ usada_at: ahora, estrellas: input.estrellas, sugerencia: input.sugerencia })
    .eq("codigo", codigo)
    .is("usada_at", null)
    .gt("expira_at", ahora)
    .select("id, organization_id, orden_id, customer_name");
  const row = cerradas?.[0];
  if (!row) {
    const { data: actual } = await db.from("calificaciones").select("usada_at, expira_at").eq("codigo", codigo).maybeSingle();
    return { ok: false, estado: estadoDe(actual ? { usada_at: actual.usada_at as string | null, expira_at: actual.expira_at as string } : null) };
  }
  if (!input.instagram) return { ok: true, puntos: 0, total: null };
  const puntos = await puntosDeEnlace({ orden_id: row.orden_id as string | null, customer_name: row.customer_name as string | null });
  const { data: cliente, error } = await db.rpc("sumar_puntos_cliente", { p_org: row.organization_id, p_instagram: input.instagram, p_puntos: puntos });
  const c = (Array.isArray(cliente) ? cliente[0] : cliente) as { id: string; puntos: number } | null;
  if (error || !c) {
    console.error("[enviarCalificacion] puntos:", error);
    return { ok: true, puntos: 0, total: null };
  }
  await db.from("calificaciones").update({ cliente_id: c.id, puntos }).eq("id", row.id);
  return { ok: true, puntos, total: Number(c.puntos) };
}
