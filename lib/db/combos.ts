import { createSupabaseServerClient } from "@/lib/supabase/server";
import { comboRegularTotal, comboSaving } from "@/lib/combos";

export interface ComboItemRow {
  id: string;
  producto_id: string;
  name: string;
  qty: number;
  price_cop: number; // unit list price
  total: number; // qty × price
}

export interface ComboRow {
  id: string;
  name: string;
  description: string | null;
  price_cop: number;
  active: boolean;
  items: ComboItemRow[];
  regular_total: number;
  saving: number;
}

export interface CombosView {
  combos: ComboRow[];
  productos: { id: string; name: string; price_cop: number }[];
}

export async function getCombosView(
  organizationId: string,
): Promise<CombosView> {
  const supabase = await createSupabaseServerClient();
  const [{ data: combos }, { data: items }, { data: productos }] =
    await Promise.all([
      supabase
        .from("combos")
        .select("id, name, description, price_cop, active")
        .eq("organization_id", organizationId)
        .order("name"),
      supabase
        .from("combo_items")
        .select("id, combo_id, producto_id, qty, position, productos(name, price_cop)")
        .eq("organization_id", organizationId)
        .order("position"),
      supabase
        .from("productos")
        .select("id, name, price_cop")
        .eq("organization_id", organizationId)
        .order("name"),
    ]);

  const byCombo = new Map<string, ComboItemRow[]>();
  for (const it of items ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prod = (it as any).productos as { name: string; price_cop: number } | null;
    const qty = Number(it.qty);
    const price = prod?.price_cop ?? 0;
    const row: ComboItemRow = {
      id: it.id as string,
      producto_id: it.producto_id as string,
      name: prod?.name ?? "—",
      qty,
      price_cop: price,
      total: qty * price,
    };
    const arr = byCombo.get(it.combo_id as string) ?? [];
    arr.push(row);
    byCombo.set(it.combo_id as string, arr);
  }

  return {
    combos: (combos ?? []).map((c) => {
      const its = byCombo.get(c.id as string) ?? [];
      const regular = comboRegularTotal(its);
      return {
        id: c.id as string,
        name: c.name as string,
        description: (c.description as string | null) ?? null,
        price_cop: c.price_cop as number,
        active: c.active as boolean,
        items: its,
        regular_total: regular,
        saving: comboSaving(regular, c.price_cop as number),
      };
    }),
    productos: (productos ?? []).map((p) => ({
      id: p.id as string,
      name: p.name as string,
      price_cop: p.price_cop as number,
    })),
  };
}
