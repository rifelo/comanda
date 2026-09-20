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
  type PosRecipeLine,
} from "./types";
import { coffeeGramsOf, drinkSpec, type RecipeLine } from "./drink-label";

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
    { data: recetaRows },
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
        "id, category_id, name, description, sku, price_cop, stock_status, image_url",
      )
      .eq("organization_id", organizationId)
      .order("name"),
    // Recipes drive the cup label's spec box ("2 SHOTS · 18 G").
    supabase
      .from("receta_items")
      .select("producto_id, qty, unit, note, position, ingredientes(name, unit)")
      .eq("organization_id", organizationId),
    supabase
      .from("producto_categorias")
      .select("id, organization_id, parent_id, label, position, created_at, imprime_etiqueta")
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
      .select("instagram, sticker_url, cup_url")
      .eq("id", organizationId)
      .maybeSingle(),
  ]);

  // ── categories: resolve each product's top-level tab + sub label ──────────
  const cats = (categorias ?? []) as ProductoCategoria[];
  // producto_id → recipe lines (name + unit + qty), for the cup label spec.
  const recipeByProduct = new Map<string, RecipeLine[]>();
  // producto_id → the recipe as displayed (long-press on a tile), in line order.
  const shownByProduct = new Map<string, Array<PosRecipeLine & { position: number }>>();
  for (const r of (recetaRows ?? []) as Array<Record<string, unknown>>) {
    const ing = r.ingredientes as { name: string; unit: string } | null;
    if (!ing) continue;
    const pid = r.producto_id as string;
    const arr = recipeByProduct.get(pid) ?? [];
    arr.push({ name: ing.name, unit: ing.unit, qty: Number(r.qty) });
    recipeByProduct.set(pid, arr);
    const shown = shownByProduct.get(pid) ?? [];
    shown.push({ name: ing.name, qty: Number(r.qty), unit: (r.unit as string | null) || ing.unit, note: (r.note as string | null) ?? null, position: Number(r.position ?? 0) });
    shownByProduct.set(pid, shown);
  }

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
    image_url: string | null;
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
    // Cup label: prepared drinks only. A flagged category decides it; a
    // product with no category at all (the cold drinks) falls back to its
    // recipe, since anything with coffee in it is prepared at the bar.
    const coffeeG = coffeeGramsOf(recipeByProduct.get(p.id) ?? []);
    const printsLabel = p.category_id
      ? (own?.imprime_etiqueta ?? false) || (top?.imprime_etiqueta ?? false)
      : coffeeG > 0;
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
      printsLabel,
      spec: drinkSpec({ coffeeG, categoryLabel: own?.label ?? top?.label ?? null }),
      image: (p.image_url ?? "").trim() || null,
      recipe: (shownByProduct.get(p.id) ?? [])
        .sort((a, b) => a.position - b.position)
        .map(({ name, qty, unit, note }) => ({ name, qty, unit, note })),
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
    sticker: ((orgRow as { sticker_url?: string | null } | null)?.sticker_url ?? "").trim() || null,
    cupArt: ((orgRow as { cup_url?: string | null } | null)?.cup_url ?? "").trim() || null,
  };
}
