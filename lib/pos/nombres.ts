/**
 * Customer names for the POS autocomplete (owner, 2-nov-2026): the names
 * written on past orders, ranked by how many orders carried them, and the
 * suggestions for what is being typed. Pure — tested in nombres.test.ts.
 */
export interface NombreFrecuente {
  nombre: string;
  /** Orders that carried the name. */
  veces: number;
}

/** Lowercase, no accents, no dots or extra spaces: «Doc. Bibiana» ~ «doc bibiana». */
export const claveNombre = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9ñ ]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * Rank the names of past orders: each order counts a name once (its roster
 * and its lines together); the spelling shown is the one used most.
 */
export function rankNombres(ordenes: ReadonlyArray<{ nombres: ReadonlyArray<string | null | undefined> }>, max = 150): NombreFrecuente[] {
  const veces = new Map<string, number>();
  const formas = new Map<string, Map<string, number>>();
  for (const o of ordenes) {
    const vistas = new Set<string>();
    for (const raw of o.nombres) {
      const nombre = (raw ?? "").replace(/\s+/g, " ").trim();
      const k = claveNombre(nombre);
      if (k.length < 2 || vistas.has(k)) continue;
      vistas.add(k);
      veces.set(k, (veces.get(k) ?? 0) + 1);
      const f = formas.get(k) ?? new Map<string, number>();
      f.set(nombre, (f.get(nombre) ?? 0) + 1);
      formas.set(k, f);
    }
  }
  return [...veces]
    .map(([k, n]) => ({ nombre: [...formas.get(k)!].sort((a, b) => b[1] - a[1])[0][0], veces: n }))
    .sort((a, b) => b.veces - a.veces || a.nombre.localeCompare(b.nombre, "es"))
    .slice(0, max);
}

/**
 * Suggestions for what is typed: names where any word starts with it
 * («bib» → «Doc. Bibiana»), the start of the whole name first, then by
 * frequency. Names in `excluir` (already on the order) are left out.
 */
export function sugerirNombres(texto: string, nombres: ReadonlyArray<NombreFrecuente>, opts: { max?: number; excluir?: ReadonlyArray<string> } = {}): NombreFrecuente[] {
  const q = claveNombre(texto);
  if (!q) return [];
  const fuera = new Set((opts.excluir ?? []).map(claveNombre));
  const hits: { n: NombreFrecuente; inicio: boolean }[] = [];
  for (const n of nombres) {
    const k = claveNombre(n.nombre);
    if (fuera.has(k) || k === q) continue;
    if (k.startsWith(q)) hits.push({ n, inicio: true });
    else if (k.split(" ").some((w) => w.startsWith(q))) hits.push({ n, inicio: false });
  }
  return hits.sort((a, b) => Number(b.inicio) - Number(a.inicio) || b.n.veces - a.n.veces).slice(0, opts.max ?? 4).map((h) => h.n);
}

/** Where the typed text sits in the name, for bolding it: [antes, coincide, después]. */
export function partesCoincidencia(nombre: string, texto: string): [string, string, string] {
  const q = claveNombre(texto);
  if (!q) return [nombre, "", ""];
  const base = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  let i = base.startsWith(q) ? 0 : base.search(new RegExp(`(^|[^a-z0-9ñ])${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  if (i < 0) return [nombre, "", ""];
  if (i > 0 || !base.startsWith(q)) i = base.indexOf(q, i);
  return [nombre.slice(0, i), nombre.slice(i, i + q.length), nombre.slice(i + q.length)];
}
