/**
 * Items proposed from the tablet while counting ("esto no está en la lista"),
 * pure helpers (tested in propuestas.test.ts). The point of proposing instead
 * of creating is to keep the catalogue clean, so the main job here is finding
 * what already exists under another spelling.
 */

export type PropuestaStatus = "pendiente" | "creado" | "unido" | "descartado";

export interface ConteoPropuesta {
  id: string;
  conteo_id: string;
  name: string;
  qty: number;
  /** As the counter said it: "und", "bolsa", "caja"… not the stock unit. */
  unit: string;
  note: string | null;
  status: PropuestaStatus;
  ingrediente_id: string | null;
  ingrediente_name: string | null;
}

/** How a counter can say what something comes in. Free text is stored as typed. */
export const PRESENTACIONES = ["und", "bolsa", "caja", "paquete", "botella", "frasco", "rollo", "g", "kg", "ml", "L"] as const;

/** Stock units an item can be created with (same list as the inventario form). */
export const UNIDADES_STOCK = ["und", "g", "kg", "ml", "L", "porción", "loncha", "bola", "caja", "bulto"] as const;

/** Best stock unit to start from, given how the counter described it. */
export function unidadSugerida(unit: string): (typeof UNIDADES_STOCK)[number] {
  const u = unit.trim();
  return (UNIDADES_STOCK as readonly string[]).includes(u) ? (u as (typeof UNIDADES_STOCK)[number]) : "und";
}

const STOP = new Set(["de", "del", "la", "el", "los", "las", "para", "con", "en", "x", "y", "por"]);

/** Lowercase, no accents, no punctuation, no filler words — what two spellings share. */
export function tokens(name: string): string[] {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t && !STOP.has(t))
    .map((t) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t)); // vasos ~ vaso
}

/**
 * Existing items that look like what is being typed, best first. A token
 * matches when one starts with the other ("serv" finds "servilletas"), so
 * suggestions appear while typing. Score = share of the typed tokens found;
 * at least half must match, and one-letter fragments never do.
 */
export function parecidos<T extends { name: string }>(name: string, items: ReadonlyArray<T>, limit = 4): T[] {
  const typed = tokens(name).filter((t) => t.length >= 2);
  if (!typed.length) return [];
  return items
    .map((it) => {
      const have = tokens(it.name);
      const hits = typed.filter((t) => have.some((h) => h.startsWith(t) || (t.startsWith(h) && h.length >= 3))).length;
      return { it, score: hits / typed.length, extra: have.length };
    })
    .filter((x) => x.score >= 0.5)
    .sort((a, b) => b.score - a.score || a.extra - b.extra || a.it.name.localeCompare(b.it.name, "es"))
    .slice(0, limit)
    .map((x) => x.it);
}

/** Same item under another spelling: every token of one is in the other. */
export function mismoNombre(a: string, b: string): boolean {
  const ta = [...new Set(tokens(a))].sort().join(" ");
  const tb = [...new Set(tokens(b))].sort().join(" ");
  return ta !== "" && ta === tb;
}
