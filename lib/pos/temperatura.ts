/**
 * Hot or cold, for the catalog's «Caliente / Frío» filter and the tile art
 * (owner, 2-nov-2026). Read from the product's sub-category: «Caliente» is
 * hot; «Frío», «Jugos», «Kombucha» and «Envasadas» are cold; anything else
 * (postres, salados) has no temperature. Pure — tested in temperatura.test.ts.
 */
export type Temperatura = "caliente" | "frio";
export type FiltroTemp = "todo" | Temperatura;

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
const CALIENTE = new Set(["caliente", "calientes"]);
const FRIO = new Set(["frio", "frios", "jugos", "jugo", "kombucha", "envasadas", "envasados", "bebidas frias"]);

export function temperaturaDe(p: { sub: string }): Temperatura | null {
  const s = norm(p.sub ?? "");
  if (CALIENTE.has(s)) return "caliente";
  if (FRIO.has(s)) return "frio";
  return null;
}

/** Products that pass the filter («todo» lets everything through). */
export function filtrarTemp<T extends { sub: string }>(items: ReadonlyArray<T>, filtro: FiltroTemp): T[] {
  return filtro === "todo" ? [...items] : items.filter((p) => temperaturaDe(p) === filtro);
}
