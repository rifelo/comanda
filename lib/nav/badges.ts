import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NavItem } from "./items";

/**
 * «Por revisar» on the owner's Inventario tab: insumos the system has below
 * zero plus team counts waiting for approval — the two blocks that lead
 * /inventario's «Por revisar». Two head-only counts, run once per layout
 * render (layouts are kept across client navigations, so the number is a
 * hint that refreshes on the next full load or revalidation). Errors → 0.
 */
export async function contarPorRevisarInventario(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any>,
  orgId: string,
): Promise<number> {
  try {
    const [neg, conteos] = await Promise.all([
      db.from("ingredientes").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("archived", false).lt("stock_current", 0),
      db.from("inventario_conteos").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "pendiente"),
    ]);
    return (neg.count ?? 0) + (conteos.count ?? 0);
  } catch {
    return 0;
  }
}

/** `items` with `badge` set on the tabs named in `counts` (0 clears it). */
export function withBadges(items: NavItem[], counts: Record<string, number>): NavItem[] {
  return items.map((it) => (it.id in counts ? { ...it, badge: counts[it.id] || undefined } : it));
}
