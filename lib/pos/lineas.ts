import { z } from "zod";
import type { PosCatalog } from "./types";

/**
 * Order lines as the server prices them. The register (app/pos/actions.ts) and
 * the WhatsApp agent both send ids, quantities and modifier names; prices are
 * always recomputed here from the live catalog, never trusted from the caller.
 */
export const ModSelectionSchema = z.record(
  z.string(),
  z.union([z.string(), z.array(z.string())]).nullable(),
);
export const LineSchema = z.object({
  kind: z.enum(["item", "combo"]),
  id: z.string(),
  qty: z.coerce.number().int().min(1).max(99),
  mods: ModSelectionSchema.optional(),
  /** Person at the table this line is for (snapshot text; prints on the cup). */
  customer: z.string().trim().max(40).optional(),
});
export type OrderLineInput = z.infer<typeof LineSchema>;
export type PricedItem = { line: OrderLineInput; name: string; unit: number; position: number };

function lineUnitPrice(
  catalog: PosCatalog,
  line: OrderLineInput,
): { name: string; unit: number } | null {
  if (line.kind === "combo") {
    const c = catalog.comboById[line.id];
    return c ? { name: c.name, unit: c.price } : null;
  }
  const p = catalog.byId[line.id];
  if (!p) return null;
  let extra = 0;
  for (const gid in line.mods ?? {}) {
    const g = catalog.modGroups[gid];
    if (!g) continue;
    const sel = line.mods![gid];
    const names = Array.isArray(sel) ? sel : sel ? [sel] : [];
    for (const n of names) {
      const opt = g.options.find((o) => o.name === n);
      if (opt) extra += opt.delta;
    }
  }
  return { name: p.name, unit: p.price + extra };
}

/** Re-price every line from the live catalog; the client never sends money. */
export function priceLines(
  catalog: PosCatalog,
  lines: OrderLineInput[],
): { ok: true; items: PricedItem[]; subtotal: number } | { ok: false; error: string } {
  const items: PricedItem[] = [];
  for (const [i, l] of lines.entries()) {
    const priced = lineUnitPrice(catalog, l);
    if (!priced) return { ok: false, error: "Un producto del pedido ya no existe." };
    items.push({ line: l, ...priced, position: i });
  }
  const subtotal = items.reduce((s, it) => s + it.unit * it.line.qty, 0);
  return { ok: true, items, subtotal };
}

export function itemRows(orgId: string, ordenId: string, items: PricedItem[]) {
  return items.map((it) => ({
    organization_id: orgId,
    orden_id: ordenId,
    kind: it.line.kind,
    producto_id: it.line.kind === "item" ? it.line.id : null,
    combo_id: it.line.kind === "combo" ? it.line.id : null,
    name: it.name,
    qty: it.line.qty,
    unit_price_cop: it.unit,
    mods: it.line.mods ?? {},
    position: it.position,
    customer_name: it.line.customer || null,
  }));
}
