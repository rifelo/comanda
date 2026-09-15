import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCombosView } from "@/lib/db/combos";
import { getModificadores } from "@/lib/db/modificadores";
import type { ProductoCategoria } from "@/lib/types";
import {
  COMBO_CAT,
  FAV_CAT,
  type PosCatalog,
  type PosCombo,
  type PosMenuItem,
  type PosModGroup,
} from "./types";

/**
 * Build the live POS catalog for an org from the catálogo/combos/modificadores
 * tables, shaped into the structures the terminal UI consumes.
 *
 * Modifier→product linkage lives in `producto_modifier_groups` (added in
 * migration 0019). When an org hasn't mapped any product yet (empty table),
 * we fall back to attaching *all* groups to every product so the experience
 * stays rich; once even one mapping exists, mappings are respected verbatim.
 */
export async function getPosCatalog({
  organizationId,
  userId,
  orgName,
  client,
}: {
  organizationId: string;
  /** `null` for a paired POS device (no user → no personal favorites). */
  userId: string | null;
  orgName: string;
  /** Service-role client for the device path; defaults to the RLS client. */
  client?: SupabaseClient;
}): Promise<PosCatalog> {
  const supabase = client ?? (await createSupabaseServerClient());

  const [
    { data: productos },
    { data: categorias },
    { data: favorites },
    { data: modLinks },
    combosView,
    modGroupsList,
    { data: orgRow },
  ] = await Promise.all([
    supabase
      .from("productos")
      .select(
        "id, category_id, name, description, sku, price_cop, stock_status",
      )
      .eq("organization_id", organizationId)
      .order("name"),
    supabase
      .from("producto_categorias")
      .select("id, organization_id, parent_id, label, position, created_at")
      .eq("organization_id", organizationId)
      .order("position"),
    userId
      ? supabase
          .from("producto_favorites")
          .select("producto_id")
          .eq("user_id", userId)
      : Promise.resolve({ data: [] as { producto_id: string }[] }),
    supabase
      .from("producto_modifier_groups")
      .select("producto_id, group_id")
      .eq("organization_id", organizationId),
    getCombosView(organizationId, client),
    getModificadores(organizationId, client),
    supabase
      .from("organizations")
      .select("instagram")
      .eq("id", organizationId)
      .maybeSingle(),
  ]);

  // ── categories: resolve each product's top-level tab + sub label ──────────
  const cats = (categorias ?? []) as ProductoCategoria[];
  const catById = new Map<string, ProductoCategoria>();
  for (const c of cats) catById.set(c.id, c);

  const topLevelOf = (id: string | null): ProductoCategoria | null => {
    let cur = id ? catById.get(id) ?? null : null;
    while (cur && cur.parent_id) cur = catById.get(cur.parent_id) ?? null;
    return cur;
  };

  // ── modifier groups: map to UI shape, keyed by id ─────────────────────────
  const modGroups: Record<string, PosModGroup> = {};
  for (const g of modGroupsList) {
    modGroups[g.id] = {
      id: g.id,
      name: g.name,
      type: g.type === "multiple" ? "multi" : "single",
      required: g.required,
      options: g.options
        .filter((o) => o.available)
        .map((o) => ({ name: o.name, delta: o.price_delta_cop })),
    };
  }
  const allGroupIds = Object.keys(modGroups);

  const linksByProduct = new Map<string, string[]>();
  for (const l of modLinks ?? []) {
    const pid = l.producto_id as string;
    const arr = linksByProduct.get(pid) ?? [];
    if (modGroups[l.group_id as string]) arr.push(l.group_id as string);
    linksByProduct.set(pid, arr);
  }
  const noMappings = (modLinks ?? []).length === 0;

  // ── products → menu items ─────────────────────────────────────────────────
  const favSet = new Set((favorites ?? []).map((f) => f.producto_id));
  const usedTopLevel = new Set<string>();
  let hasUncategorized = false;

  const menu: PosMenuItem[] = ((productos ?? []) as Array<{
    id: string;
    category_id: string | null;
    name: string;
    description: string | null;
    sku: string;
    price_cop: number;
    stock_status: "ok" | "bajo" | "sin";
  }>).map((p) => {
    const own = p.category_id ? catById.get(p.category_id) ?? null : null;
    const top = topLevelOf(p.category_id);
    let catId: string;
    let sub: string;
    if (top) {
      catId = top.id;
      sub = own && own.id !== top.id ? own.label : "";
      usedTopLevel.add(top.id);
    } else {
      catId = "otros";
      sub = "";
      hasUncategorized = true;
    }
    const mods = noMappings
      ? allGroupIds
      : linksByProduct.get(p.id) ?? [];
    return {
      id: p.id,
      name: p.name,
      catId,
      sub,
      sku: p.sku,
      price: p.price_cop,
      gluten: true, // productos has no allergen column yet — assume contains.
      fav: favSet.has(p.id),
      stock: p.stock_status,
      mods,
      desc: p.description ?? "",
    };
  });

  // ── combos → UI shape (regular total/saving precomputed by getCombosView) ──
  const combos: PosCombo[] = combosView.combos
    .filter((c) => c.active)
    .map((c) => ({
      id: c.id,
      name: c.name,
      items: c.items.map((it) => it.producto_id),
      price: c.price_cop,
      desc: c.description ?? c.items.map((it) => it.name).join(" + "),
      saving: c.saving,
    }));

  // ── tabs: Favoritos · real top-level cats (only those with products) · Combos
  const tabCats = cats
    .filter((c) => c.parent_id === null && usedTopLevel.has(c.id))
    .sort((a, b) => a.position - b.position)
    .map((c) => ({ id: c.id, label: c.label }));

  const catalogCats = [
    { id: FAV_CAT, label: "Favoritos" },
    ...tabCats,
    ...(hasUncategorized ? [{ id: "otros", label: "Otros" }] : []),
    ...(combos.length ? [{ id: COMBO_CAT, label: "Combos" }] : []),
  ];

  const byId: Record<string, PosMenuItem> = {};
  for (const m of menu) byId[m.id] = m;
  const comboById: Record<string, PosCombo> = {};
  for (const c of combos) comboById[c.id] = c;
  const catLabel: Record<string, string> = {};
  for (const c of catalogCats) catLabel[c.id] = c.label;

  return {
    cats: catalogCats,
    menu,
    combos,
    modGroups,
    byId,
    comboById,
    catLabel,
    orgName,
    instagram: ((orgRow as { instagram?: string | null } | null)?.instagram ?? "").replace(/^@/, "").trim() || null,
  };
}
