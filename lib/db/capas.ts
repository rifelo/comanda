import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { esOpcion16, sustituiblesDe, tam16DeOpciones, type IngInfo, type OpcionRecetaRow, type Tam16 } from "@/lib/recetas/capas";

/** What a product's ficha técnica needs besides its own layers. */
export interface ContextoCapas {
  /** Every active ingredient of the org (name + unit), by id. */
  ings: Record<string, IngInfo>;
  /** The product's recipe: ingrediente_id → qty, to check the layers add up. */
  receta: Record<string, number>;
  tam16: Tam16 | null;
  sustituibles: string[];
  price16: number | null;
}

/** Ingredients, recipe and the options the product takes (16 oz, Deslactosada…). */
export async function contextoCapas(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped client, as elsewhere in lib/db
  supabase: SupabaseClient<any>,
  orgId: string,
  productoId: string,
): Promise<ContextoCapas> {
  const [{ data: ings }, { data: receta }, { data: links }, { data: prod }] = await Promise.all([
    supabase.from("ingredientes").select("id, name, unit").eq("organization_id", orgId).eq("archived", false).order("name"),
    supabase.from("receta_items").select("ingrediente_id, qty, ingredientes(name, unit)").eq("organization_id", orgId).eq("producto_id", productoId),
    supabase.from("producto_modifier_groups").select("group_id").eq("organization_id", orgId).eq("producto_id", productoId),
    supabase.from("productos").select("price_cop").eq("organization_id", orgId).eq("id", productoId).maybeSingle(),
  ]);
  const groupIds = (links ?? []).map((l) => l.group_id as string);
  const { data: opts } = groupIds.length
    ? await supabase.from("modifier_options").select("id, name, price_delta_cop").eq("organization_id", orgId).in("group_id", groupIds)
    : { data: [] as { id: string; name: string; price_delta_cop: number }[] };
  const optIds = (opts ?? []).map((o) => o.id as string);
  const { data: rows } = optIds.length
    ? await supabase
        .from("modifier_option_receta")
        .select("option_id, ingrediente_id, reemplaza_id, qty, ingredientes!modifier_option_receta_ingrediente_id_fkey(name)")
        .eq("organization_id", orgId)
        .in("option_id", optIds)
    : { data: [] as Record<string, unknown>[] };

  const map: Record<string, IngInfo> = {};
  for (const i of ings ?? []) map[i.id as string] = { name: i.name as string, unit: i.unit as string };
  const rec: Record<string, number> = {};
  for (const r of receta ?? []) {
    const id = r.ingrediente_id as string;
    rec[id] = (rec[id] ?? 0) + Number(r.qty);
    const ing = (Array.isArray(r.ingredientes) ? r.ingredientes[0] : r.ingredientes) as { name: string; unit: string } | null;
    if (ing && !map[id]) map[id] = ing; // archived but still in the recipe
  }
  const optName = new Map((opts ?? []).map((o) => [o.id as string, o.name as string]));
  const filas: OpcionRecetaRow[] = (rows ?? []).map((r) => {
    const ing = (Array.isArray(r.ingredientes) ? r.ingredientes[0] : r.ingredientes) as { name: string } | null;
    return {
      optionName: optName.get(r.option_id as string) ?? "",
      ingredienteId: r.ingrediente_id as string,
      ingredienteName: ing?.name ?? "",
      reemplazaId: (r.reemplaza_id as string | null) ?? null,
      qty: Number(r.qty),
    };
  });
  const o16 = (opts ?? []).find((o) => esOpcion16(o.name as string));
  return {
    ings: map,
    receta: rec,
    tam16: tam16DeOpciones(filas),
    sustituibles: [...sustituiblesDe(filas)],
    price16: o16 && prod ? Number(prod.price_cop) + Number(o16.price_delta_cop) : null,
  };
}
