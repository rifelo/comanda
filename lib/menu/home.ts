import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { bogota, desdeDe, ordenarRanking } from "@/lib/clientes/mi-payo";
import { cargarRanking } from "@/lib/clientes/mi-payo-db";
import { loadMenu, menuContent } from "./data";
import { elegirFavoritas, type Favorita } from "./home-rules";

export type { Favorita } from "./home-rules";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

/** «Noviembre» — the Bogotá month of an instant. */
export const mesActual = (ahora: Date = new Date()) => MESES[bogota(ahora).m];

/** Units of each SKU paid since an instant. */
async function vendidosDesde(orgId: string, desde: string): Promise<Map<string, number>> {
  const db = createSupabaseAdminClient();
  const [{ data: ordenes, error }, { data: productos, error: e2 }] = await Promise.all([
    db.from("ordenes").select("id").eq("organization_id", orgId).eq("status", "pagada").gte("created_at", desde),
    db.from("productos").select("id, sku").eq("organization_id", orgId),
  ]);
  if (error) throw error;
  if (e2) throw e2;
  const sku = new Map((productos ?? []).map((p) => [p.id as string, p.sku as string]));
  const ids = (ordenes ?? []).map((o) => o.id as string);
  const vendidos = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: items, error: e3 } = await db.from("orden_items").select("producto_id, qty").in("orden_id", ids.slice(i, i + 200));
    if (e3) throw e3;
    for (const it of items ?? []) {
      const s = it.producto_id ? sku.get(it.producto_id as string) : undefined;
      if (s) vendidos.set(s, (vendidos.get(s) ?? 0) + Number(it.qty));
    }
  }
  return vendidos;
}

/** Units sold this Bogotá month; on a month with no sales yet (its first morning), the last 90 days. */
async function vendidosDelMes(orgId: string, ahora: Date): Promise<Map<string, number>> {
  const mes = await vendidosDesde(orgId, desdeDe("mes", ahora)!.toISOString());
  return mes.size > 0 ? mes : vendidosDesde(orgId, new Date(ahora.getTime() - 90 * 86_400_000).toISOString());
}

/** «Las favoritas del mes» on the Home: the menu's promo picks first, then this month's best sellers. */
export async function favoritasDelMes(ahora: Date = new Date()): Promise<Favorita[]> {
  const [secciones, vendidos] = await Promise.all([
    loadMenu(),
    vendidosDelMes(menuContent.organizationId, ahora).catch((e) => {
      console.error("[home favoritas]", e);
      return new Map<string, number>();
    }),
  ]);
  const promo = menuContent.promo?.on ? menuContent.promo.items.map((i) => i.sku) : [];
  return elegirFavoritas(secciones, promo, vendidos, 3);
}

export interface Lider {
  puesto: number;
  instagram: string;
  puntos: number;
}

/** Top 3 of this month's ranking (points earned this month). */
export async function podioDelMes(ahora: Date = new Date()): Promise<Lider[]> {
  const filas = ordenarRanking(await cargarRanking(menuContent.organizationId, "mes", ahora));
  return filas.slice(0, 3).map((f, i) => ({ puesto: i + 1, instagram: f.instagram, puntos: f.puntos }));
}
