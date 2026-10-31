/**
 * Owner's inventory list and product list helpers (docs/redesign/PLAN.md
 * §6.2–6.3): search, the zone grouping the tablet uses, the recipe stock
 * state of a product and the ingredient picker order. Pure — unit-tested in
 * existencias.test.ts.
 */
import { stockLevel, type StockLevel } from "@/lib/cost";
import { normalizar, zonaDe, type ZonaAcabando } from "./acabando";
import { cantidadLegible, nivelDe, type Nivel } from "./niveles";

export interface InsumoLista {
  id: string;
  name: string;
  unit: string;
  stock_current: number;
  stock_min: number;
  stock_critico: number;
  cost_cop: number;
  pack_qty: number | null;
  pack_label: string | null;
  pieza_qty: number | null;
  ubicacion: string | null;
  category_id: string | null;
}

export interface FilaInsumo<T extends InsumoLista = InsumoLista> {
  item: T;
  zona: ZonaAcabando;
  nivel: Nivel;
  /** «2 bolsas», «350 g», «−568 g». */
  stock: string;
  negativo: boolean;
}

export function filaInsumo<T extends InsumoLista>(it: T): FilaInsumo<T> {
  const stock = Number(it.stock_current);
  const negativo = stock < 0;
  const legible = cantidadLegible(Math.abs(stock), it);
  return {
    item: it,
    zona: zonaDe(it.ubicacion),
    nivel: nivelDe(stock, Number(it.stock_critico ?? 0), Number(it.stock_min ?? 0)),
    stock: negativo ? `−${legible}` : legible,
    negativo,
  };
}

/** Rows matching a search (name or category, accent-insensitive) and a zone («todas» = all). */
export function filtrarInsumos<T extends InsumoLista>(
  filas: ReadonlyArray<FilaInsumo<T>>,
  opts: { q: string; zona: ZonaAcabando | "todas"; categoria?: (id: string | null) => string },
): FilaInsumo<T>[] {
  const q = normalizar(opts.q);
  return filas.filter((f) => {
    if (q) {
      const cat = opts.categoria ? normalizar(opts.categoria(f.item.category_id)) : "";
      return normalizar(f.item.name).includes(q) || (cat !== "" && cat.includes(q));
    }
    return opts.zona === "todas" || f.zona === opts.zona;
  });
}

/** Zones that have items, in the walked order, «Otros» last; with counts. */
export function zonasConConteo<T extends InsumoLista>(filas: ReadonlyArray<FilaInsumo<T>>): { zona: ZonaAcabando; n: number }[] {
  const orden: ZonaAcabando[] = ["Barra", "Nevera", "Vitrina", "Bodega", "Aseo", "Otros"];
  const n = new Map<ZonaAcabando, number>();
  for (const f of filas) n.set(f.zona, (n.get(f.zona) ?? 0) + 1);
  return orden.filter((z) => n.has(z)).map((zona) => ({ zona, n: n.get(zona)! }));
}

/** Sort for the list: negatives, then «se acabó», «poco», then by name. */
export function ordenarFilas<T extends InsumoLista>(filas: ReadonlyArray<FilaInsumo<T>>): FilaInsumo<T>[] {
  const peso = (f: FilaInsumo<T>) => (f.negativo ? 0 : f.nivel === "rojo" ? 1 : f.nivel === "amarillo" ? 2 : 3);
  return [...filas].sort((a, b) => peso(a) - peso(b) || a.item.name.localeCompare(b.item.name, "es"));
}

/**
 * Stock state of a product's recipe: «sin» when an ingredient is at/below 0,
 * «bajo» when one is at/below its minimum, «ok» otherwise; null without a
 * recipe. Returns the first ingredient that is short, to name it.
 */
export function stockDeReceta(lines: ReadonlyArray<{ name: string; stock: number; min: number }>): { estado: StockLevel | null; falta: string | null } {
  if (lines.length === 0) return { estado: null, falta: null };
  let peor: StockLevel = "ok";
  let falta: string | null = null;
  for (const l of lines) {
    const s = stockLevel(l.stock, l.min);
    if (s === "sin" && peor !== "sin") {
      peor = "sin";
      falta = l.name;
    } else if (s === "bajo" && peor === "ok") {
      peor = "bajo";
      falta = l.name;
    }
  }
  return { estado: peor, falta };
}

/**
 * Ingredient picker for a recipe: with a search, the matches (starts-with
 * first); without one, the recently added then the most used ingredients —
 * what the owner reaches for — skipping those already in the recipe.
 */
export function opcionesReceta<T extends { id: string; name: string }>(
  options: ReadonlyArray<T>,
  input: { q: string; excluir: ReadonlySet<string>; recientes: ReadonlyArray<string>; usos: ReadonlyMap<string, number>; limite?: number },
): T[] {
  const limite = input.limite ?? 12;
  const libres = options.filter((o) => !input.excluir.has(o.id));
  const q = normalizar(input.q);
  if (q) {
    const hits = libres.filter((o) => normalizar(o.name).includes(q));
    return hits
      .sort((a, b) => Number(!normalizar(a.name).startsWith(q)) - Number(!normalizar(b.name).startsWith(q)) || a.name.localeCompare(b.name, "es"))
      .slice(0, limite * 2);
  }
  const byId = new Map(libres.map((o) => [o.id, o]));
  const out: T[] = [];
  const seen = new Set<string>();
  for (const id of input.recientes) {
    const o = byId.get(id);
    if (o && !seen.has(id)) {
      out.push(o);
      seen.add(id);
    }
  }
  const frecuentes = libres.filter((o) => !seen.has(o.id) && (input.usos.get(o.id) ?? 0) > 0).sort((a, b) => (input.usos.get(b.id) ?? 0) - (input.usos.get(a.id) ?? 0) || a.name.localeCompare(b.name, "es"));
  for (const o of frecuentes) out.push(o);
  return out.slice(0, limite);
}

/** Lines to copy when duplicating another recipe: those not already present (the existing qty wins). */
export function lineasParaDuplicar<L extends { ingrediente_id: string }>(origen: ReadonlyArray<L>, actuales: ReadonlySet<string>): L[] {
  const seen = new Set<string>();
  return origen.filter((l) => {
    if (actuales.has(l.ingrediente_id) || seen.has(l.ingrediente_id)) return false;
    seen.add(l.ingrediente_id);
    return true;
  });
}
