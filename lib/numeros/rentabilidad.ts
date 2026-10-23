/**
 * Is the day profitable? Pure (tested in rentabilidad.test.ts); the loader is
 * lib/numeros/data.ts.
 *
 * Per product: what it sold, what its recipe cost (the product's cost today,
 * plus the recipe of the option chosen — a juice «En leche» costs the milk)
 * and what it left. For the day: sales − cost of goods = gross profit;
 * − the Bold fee (booked that day, or estimated on non-cash payments)
 * − the other expenses of the day − the day's share of the fixed costs
 * (rent, utilities, payroll: booked once a month, spread over its days)
 * = what the day really left.
 */
import { comisionBold, type CategoriaGasto } from "@/lib/gastos/gastos";

/** Drinks should keep at least this margin (the rule in Recetas); postres are a hook, measured by rotation. */
export const MARGEN_OBJETIVO = 55;
/** Paid once a month and spread over its days. */
export const CATEGORIAS_FIJAS: ReadonlySet<CategoriaGasto> = new Set<CategoriaGasto>(["arriendo", "servicios", "nomina"]);
/** Categories that are a hook on purpose: a low margin there is a decision, not an alarm. */
const GANCHO = new Set(["postres"]);

export interface ItemVendido {
  key: string;
  name: string;
  qty: number;
  unitPrice: number;
  /** group id → chosen option name, as the POS stores it. */
  mods: Record<string, string>;
}

export interface CostoProducto {
  /** Recipe cost of one unit; 0 or missing = no cost loaded. */
  costo: number;
  categoria: string | null;
}

export interface ProductoRentable {
  key: string;
  name: string;
  categoria: string | null;
  unidades: number;
  ingreso: number;
  costo: number;
  utilidad: number;
  /** Utilidad / ingreso, in whole percent; null without sales. */
  margen: number | null;
  /** No recipe cost: its utilidad is overstated. */
  sinCosto: boolean;
  /** Under MARGEN_OBJETIVO and not a hook category. */
  bajo: boolean;
}

export interface CategoriaRentable {
  categoria: string;
  ingreso: number;
  costo: number;
  utilidad: number;
  margen: number | null;
}

export interface RentabilidadDia {
  productos: ProductoRentable[];
  categorias: CategoriaRentable[];
  ventas: number;
  costoVenta: number;
  utilidadBruta: number;
  margenBruto: number | null;
  comision: { monto: number; estimada: boolean; base: number };
  otrosGastos: number;
  fijos: { dia: number; mes: number; diasMes: number; mesFuente: string | null };
  utilidadNeta: number;
  /** Sales needed to cover the fee, the other expenses and the fixed share at today's margin; null when the margin is ≤ 0. */
  equilibrio: number | null;
  /** Units and sales of products without a cost. */
  sinCosto: { productos: number; ingreso: number };
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** The day's share of the fixed costs booked in a month: their total over the month's days. */
export function fijosPorDia(gastosMes: ReadonlyArray<{ categoria: CategoriaGasto; monto: number }>, diasMes: number): { mes: number; dia: number } {
  const mes = round2(gastosMes.filter((g) => CATEGORIAS_FIJAS.has(g.categoria)).reduce((s, g) => s + g.monto, 0));
  return { mes, dia: diasMes > 0 ? Math.round(mes / diasMes) : 0 };
}

export function rentabilidadDia(input: {
  items: ReadonlyArray<ItemVendido>;
  costos: ReadonlyMap<string, CostoProducto>;
  /** `${groupId}|${optionName}` → recipe cost of the option. */
  costosOpcion: ReadonlyMap<string, number>;
  /** Transferencias + tarjeta of the day: what Bold charges on. */
  cobrosNoEfectivo: number;
  /** The day's expenses, fixed ones included (they are left out and spread instead). */
  gastosDia: ReadonlyArray<{ categoria: CategoriaGasto; monto: number }>;
  fijos: { dia: number; mes: number; diasMes: number; mesFuente: string | null };
}): RentabilidadDia {
  const por = new Map<string, ProductoRentable>();
  for (const it of input.items) {
    const c = input.costos.get(it.key);
    let p = por.get(it.key);
    if (!p) {
      p = { key: it.key, name: it.name, categoria: c?.categoria ?? null, unidades: 0, ingreso: 0, costo: 0, utilidad: 0, margen: null, sinCosto: !(c && c.costo > 0), bajo: false };
      por.set(it.key, p);
    }
    const opcion = Object.entries(it.mods ?? {}).reduce((s, [g, name]) => s + (input.costosOpcion.get(`${g}|${name}`) ?? 0), 0);
    p.unidades += it.qty;
    p.ingreso += it.qty * it.unitPrice;
    p.costo += it.qty * ((c?.costo ?? 0) + opcion);
  }
  const productos = [...por.values()].map((p) => {
    const costo = Math.round(p.costo);
    const utilidad = p.ingreso - costo;
    const margen = pct(utilidad, p.ingreso);
    const gancho = GANCHO.has((p.categoria ?? "").toLowerCase());
    return { ...p, costo, utilidad, margen, bajo: !p.sinCosto && !gancho && margen != null && margen < MARGEN_OBJETIVO };
  });
  productos.sort((a, b) => b.utilidad - a.utilidad || b.unidades - a.unidades || a.name.localeCompare(b.name, "es"));

  const porCat = new Map<string, CategoriaRentable>();
  for (const p of productos) {
    const k = p.categoria ?? "Sin categoría";
    const c = porCat.get(k) ?? { categoria: k, ingreso: 0, costo: 0, utilidad: 0, margen: null };
    c.ingreso += p.ingreso;
    c.costo += p.costo;
    c.utilidad += p.utilidad;
    porCat.set(k, c);
  }
  const categorias = [...porCat.values()].map((c) => ({ ...c, margen: pct(c.utilidad, c.ingreso) })).sort((a, b) => b.utilidad - a.utilidad);

  const ventas = productos.reduce((s, p) => s + p.ingreso, 0);
  const costoVenta = productos.reduce((s, p) => s + p.costo, 0);
  const utilidadBruta = ventas - costoVenta;

  // The fee booked that day wins over the estimate, so it is never counted twice.
  const comisionReg = round2(input.gastosDia.filter((g) => g.categoria === "comisiones").reduce((s, g) => s + g.monto, 0));
  const comision = comisionReg > 0
    ? { monto: comisionReg, estimada: false, base: input.cobrosNoEfectivo }
    : { monto: comisionBold(input.cobrosNoEfectivo).total, estimada: true, base: input.cobrosNoEfectivo };
  const otrosGastos = round2(input.gastosDia.filter((g) => g.categoria !== "comisiones" && !CATEGORIAS_FIJAS.has(g.categoria)).reduce((s, g) => s + g.monto, 0));
  const utilidadNeta = Math.round(utilidadBruta - comision.monto - otrosGastos - input.fijos.dia);

  // Break-even at today's mix: the fee scales with sales (as a share of them), the rest does not.
  const tasaComision = ventas > 0 ? comision.monto / ventas : 0;
  const contribucion = ventas > 0 ? utilidadBruta / ventas - tasaComision : 0;
  const equilibrio = contribucion > 0 ? Math.round((otrosGastos + input.fijos.dia) / contribucion) : null;

  const sin = productos.filter((p) => p.sinCosto);
  return {
    productos,
    categorias,
    ventas,
    costoVenta,
    utilidadBruta,
    margenBruto: pct(utilidadBruta, ventas),
    comision,
    otrosGastos,
    fijos: input.fijos,
    utilidadNeta,
    equilibrio,
    sinCosto: { productos: sin.length, ingreso: sin.reduce((s, p) => s + p.ingreso, 0) },
  };
}
