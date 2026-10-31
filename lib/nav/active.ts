import type { NavItem, NavSection } from "./items";

/** True when `pathname` is `prefix` itself or below it ("/caja" ≠ "/cajas"). */
export function underPrefix(pathname: string, prefix: string): boolean {
  if (!prefix) return false;
  if (prefix === "/") return pathname === "/";
  return pathname === prefix || pathname.startsWith(prefix.endsWith("/") ? prefix : prefix + "/");
}

/** Length of the most specific prefix of `item` that matches, or -1. */
function score(pathname: string, prefixes: string[], exact: string[] = []): number {
  let best = -1;
  for (const e of exact) if (pathname === e) best = Math.max(best, e.length + 1000);
  for (const p of prefixes) if (underPrefix(pathname, p)) best = Math.max(best, p.length);
  return best;
}

function itemScore(pathname: string, item: NavItem): number {
  const prefixes = item.match ?? (item.exact ? [] : [item.href]);
  return score(pathname, prefixes, item.exact);
}

/**
 * The item whose most specific prefix matches `pathname` (longest wins, so
 * "/configuracion/equipo" goes to Equipo, not to Ajustes under Más).
 * `extra` lets a single tab claim more prefixes (the «Más» tab claims every
 * page reached through /mas).
 */
export function activeTabFor(
  pathname: string,
  items: NavItem[],
  extra: Record<string, string[]> = {},
): NavItem | null {
  let best: NavItem | null = null;
  let bestScore = -1;
  for (const item of items) {
    const s = Math.max(itemScore(pathname, item), score(pathname, extra[item.id] ?? []));
    if (s > bestScore) {
      best = item;
      bestScore = s;
    }
  }
  return bestScore >= 0 ? best : null;
}

/**
 * Most specific matching item across several lists — used to find which
 * «Más» entry (Ajustes, Clientes…) owns the current page, for its sections.
 */
export function activeItemIn(pathname: string, ...lists: NavItem[][]): NavItem | null {
  return activeTabFor(pathname, lists.flat());
}

/**
 * A section whose href carries a query (`/inventario?vista=acabando`) is
 * active on that exact path when every one of its params is in `search`;
 * it then beats the plain exact match of the same path.
 */
function queryScore(pathname: string, search: string, href: string): number {
  const q = href.indexOf("?");
  if (q < 0) return -1;
  if (pathname !== href.slice(0, q)) return -1;
  const want = new URLSearchParams(href.slice(q + 1));
  const have = new URLSearchParams(search);
  for (const [k, v] of want) if (have.get(k) !== v) return -1;
  return href.length + 2000;
}

/**
 * The active section of a tab; a section with `match: []` is exact-only.
 * `search` (the current query string) only matters for query hrefs.
 */
export function activeSectionFor(pathname: string, sections: NavSection[], search = ""): NavSection | null {
  let best: NavSection | null = null;
  let bestScore = -1;
  for (const s of sections) {
    const sc = s.href.includes("?")
      ? Math.max(queryScore(pathname, search, s.href), score(pathname, s.match ?? []))
      : score(pathname, s.match ?? [s.href], [s.href]);
    if (sc > bestScore) {
      best = s;
      bestScore = sc;
    }
  }
  return bestScore >= 0 ? best : null;
}
