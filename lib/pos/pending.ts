/**
 * Pure helpers for pending orders (no React, no store): rebuild ticket lines
 * from a stored order against the live catalog, and small formatting bits.
 * Unit-tested in pending.test.ts.
 */
import type {
  ModSelection,
  OrderLine,
  PendingOrder,
  PosCatalog,
  PosMenuItem,
} from "./types";

/** Default modifier selection for a product: required singles pick the first option. */
export function defaultMods(p: PosMenuItem, catalog: PosCatalog): ModSelection {
  const out: ModSelection = {};
  p.mods.forEach((gid) => {
    const g = catalog.modGroups[gid];
    if (!g) return;
    out[gid] = g.type === "single" ? (g.required ? g.options[0]?.name ?? null : null) : [];
  });
  return out;
}

/**
 * Stored selections re-validated against today's catalog: groups the product
 * no longer has are dropped, option names that vanished are dropped, and a
 * required single with nothing valid left falls back to its first option.
 */
export function sanitizeMods(
  stored: unknown,
  p: PosMenuItem,
  catalog: PosCatalog,
): ModSelection {
  const out = defaultMods(p, catalog);
  if (!stored || typeof stored !== "object") return out;
  const src = stored as Record<string, unknown>;
  for (const gid of p.mods) {
    const g = catalog.modGroups[gid];
    if (!g || !(gid in src)) continue;
    const raw = src[gid];
    const names = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter(
      (n): n is string => typeof n === "string" && g.options.some((o) => o.name === n),
    );
    if (g.type === "single") {
      out[gid] = names[0] ?? (g.required ? g.options[0]?.name ?? null : null);
    } else out[gid] = names;
  }
  return out;
}

/**
 * Ticket lines for a stored order. Items still in the catalog become live
 * lines (priced from the catalog, so an edit re-prices); anything that has
 * disappeared keeps its snapshot name/price and is flagged `missing` so the
 * UI can block saving until the cashier removes it.
 */
export function rebuildLines(
  order: PendingOrder,
  catalog: PosCatalog,
): { lines: OrderLine[]; missing: number } {
  let missing = 0;
  const lines = [...order.items]
    .sort((a, b) => a.position - b.position)
    .map((it): OrderLine => {
      if (it.kind === "item" && it.productoId && catalog.byId[it.productoId]) {
        const p = catalog.byId[it.productoId];
        return {
          id: p.id,
          name: p.name,
          basePrice: p.price,
          qty: it.qty,
          gluten: p.gluten,
          kind: "item",
          mods: sanitizeMods(it.mods, p, catalog),
          hasMods: p.mods.length > 0,
          expanded: false,
        };
      }
      if (it.kind === "combo" && it.comboId && catalog.comboById[it.comboId]) {
        const c = catalog.comboById[it.comboId];
        return { id: c.id, name: c.name, price: c.price, qty: it.qty, kind: "combo", items: c.items };
      }
      missing += 1;
      return {
        id: it.productoId ?? it.comboId ?? it.id,
        name: it.name,
        qty: it.qty,
        kind: it.kind,
        ...(it.kind === "combo" ? { price: it.unitPrice } : { basePrice: it.unitPrice }),
        mods: {},
        hasMods: false,
        missing: true,
      };
    });
  return { lines, missing };
}

/** "ahora" · "hace 5 min" · "hace 1 h 10 min" — for the pending list. */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const mins = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `hace ${h} h ${m} min` : `hace ${h} h`;
}

/** What the server actions accept for a ticket: ids + qty + mods only. */
export function linesPayload(order: OrderLine[]) {
  return order.map((l) => ({ kind: l.kind, id: l.id, qty: l.qty, mods: l.mods ?? {} }));
}
