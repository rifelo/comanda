import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import contenido from "./menu.json";
import { buildMenu, type CatalogProduct, type MenuContent, type MenuSection } from "./menu";

export const menuContent = contenido as MenuContent;

/**
 * The menu as customers see it right now: the POS catalog of the menu's
 * organization merged with the menu copy. Read with the service role — the
 * page is public and has no session — and only the columns a customer may
 * see (never costs).
 */
export async function loadMenu(): Promise<MenuSection[]> {
  const db = createSupabaseAdminClient();
  const orgId = menuContent.organizationId;
  const [{ data: productos }, { data: links }, { data: grupos }] = await Promise.all([
    db.from("productos").select("id, sku, name, price_cop, stock_status, description, categoria:producto_categorias(label)").eq("organization_id", orgId),
    db.from("producto_modifier_groups").select("producto_id, group_id").eq("organization_id", orgId),
    db.from("modifier_groups").select("id, type, required, modifier_options(name, price_delta_cop, available, position)").eq("organization_id", orgId),
  ]);
  // Only a required single choice changes what the customer asks for ("en agua / en leche").
  const opciones = new Map<string, { name: string; delta: number }[]>();
  for (const g of grupos ?? []) {
    if (g.type !== "single" || !g.required) continue;
    const opts = ((g.modifier_options ?? []) as Array<{ name: string; price_delta_cop: number; available: boolean; position: number }>)
      .filter((o) => o.available)
      .sort((a, b) => a.position - b.position)
      .map((o) => ({ name: o.name, delta: Number(o.price_delta_cop) }));
    if (opts.length > 1) opciones.set(g.id as string, opts);
  }
  const grupoDe = new Map<string, string>();
  for (const l of links ?? []) if (opciones.has(l.group_id as string) && !grupoDe.has(l.producto_id as string)) grupoDe.set(l.producto_id as string, l.group_id as string);

  const catalog: CatalogProduct[] = (productos ?? []).map((p) => {
    const cat = p.categoria as unknown as { label: string } | { label: string }[] | null;
    const gid = grupoDe.get(p.id as string);
    return {
      sku: p.sku as string,
      name: p.name as string,
      price: Number(p.price_cop),
      stock: p.stock_status as string,
      description: (p.description as string | null) ?? null,
      category: (Array.isArray(cat) ? cat[0]?.label : cat?.label) ?? null,
      options: gid ? opciones.get(gid)! : [],
    };
  });
  return buildMenu(menuContent, catalog);
}
