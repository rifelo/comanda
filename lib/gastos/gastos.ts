/**
 * Business expenses that are neither inventory nor cash from the drawer: the
 * Bold fee on transfers, rent, utilities, payroll… Pure helpers — categories,
 * validation, amounts with cents, the Bold fee and totals. No I/O;
 * unit-tested in gastos.test.ts. The reads and writes live in gastos-db.ts.
 */

export const CATEGORIAS_GASTO = ["comisiones", "arriendo", "servicios", "nomina", "mantenimiento", "publicidad", "impuestos", "otro"] as const;
export type CategoriaGasto = (typeof CATEGORIAS_GASTO)[number];

export const CATEGORIA_GASTO: Record<CategoriaGasto, { label: string; hint: string }> = {
  comisiones: { label: "Comisiones", hint: "Bold, datáfono, banco, 4x1000" },
  arriendo: { label: "Arriendo", hint: "El local" },
  servicios: { label: "Servicios", hint: "Luz, agua, gas, internet, teléfono" },
  nomina: { label: "Nómina", hint: "Pagos al equipo" },
  mantenimiento: { label: "Mantenimiento", hint: "Reparaciones, aseo, equipos" },
  publicidad: { label: "Publicidad", hint: "Pauta, impresos, redes" },
  impuestos: { label: "Impuestos", hint: "DIAN, industria y comercio" },
  otro: { label: "Otro", hint: "Cuéntalo en el concepto" },
};

export const CUENTAS_GASTO = ["bold", "banco", "efectivo", "otra"] as const;
export type CuentaGasto = (typeof CUENTAS_GASTO)[number];

export const CUENTA_GASTO: Record<CuentaGasto, string> = {
  bold: "Bold",
  banco: "Banco",
  efectivo: "Efectivo (fuera de la caja)",
  otra: "Otra",
};

export const CONCEPTO_MIN = 3;
export const MONTO_GASTO_MAX = 50_000_000;

/** Why an expense can't be saved yet, or null when it can. */
export function errorGasto(input: { fecha: string; categoria: string | null; concepto: string; monto: number | null; cuenta: string | null }): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fecha)) return "Elige el día del gasto.";
  if (!input.categoria || !(CATEGORIAS_GASTO as readonly string[]).includes(input.categoria)) return "Elige la categoría.";
  if (input.concepto.trim().length < CONCEPTO_MIN) return "Escribe de qué es el gasto.";
  if (input.monto === null || !Number.isFinite(input.monto) || input.monto <= 0) return "Escribe el monto en pesos.";
  if (input.monto > MONTO_GASTO_MAX) return "Ese monto es demasiado grande; revisa los ceros.";
  if (Math.abs(Math.round(input.monto * 100) - input.monto * 100) > 1e-6) return "El monto admite hasta dos decimales.";
  if (!input.cuenta || !(CUENTAS_GASTO as readonly string[]).includes(input.cuenta)) return "Elige de qué cuenta salió.";
  return null;
}

/**
 * Pesos as Colombians type them, cents allowed: "4.345,40", "4345,4",
 * "$ 12.000", "4345.40" → number. A single "." followed by exactly 3 digits
 * is a thousands separator ("12.000"); otherwise "." or "," before 1–2
 * digits are the cents. Null when it isn't an amount.
 */
export function parseMontoGasto(text: string): number | null {
  const t = text.replace(/[$\s]/g, "");
  if (!t) return null;
  const m = t.match(/^(\d{1,3}(?:\.\d{3})*|\d+)(?:[,.](\d{1,2}))?$/);
  if (!m) return null;
  const entero = Number(m[1].replace(/\./g, ""));
  const cent = m[2] ? Number(m[2].padEnd(2, "0")) : 0;
  return entero + cent / 100;
}

/** Bold's charge on a deposit as it shows on the statement: fee 1,495 % and the 4x1000 on the fee. */
export const BOLD_COMISION = 0.01495;
export function comisionBold(ingreso: number): { comision: number; gmf: number; total: number } {
  const comision = Math.round(ingreso * BOLD_COMISION * 100) / 100;
  const gmf = Math.round(comision * 0.004 * 100) / 100;
  return { comision, gmf, total: Math.round((comision + gmf) * 100) / 100 };
}

/** Total and per-category totals (largest first). */
export function resumenGastos(rows: ReadonlyArray<{ categoria: CategoriaGasto; monto: number }>): { total: number; porCategoria: { categoria: CategoriaGasto; monto: number; n: number }[] } {
  const m = new Map<CategoriaGasto, { monto: number; n: number }>();
  let total = 0;
  for (const r of rows) {
    total += r.monto;
    const c = m.get(r.categoria) ?? { monto: 0, n: 0 };
    c.monto += r.monto;
    c.n += 1;
    m.set(r.categoria, c);
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    total: round(total),
    porCategoria: [...m.entries()].map(([categoria, c]) => ({ categoria, monto: round(c.monto), n: c.n })).sort((a, b) => b.monto - a.monto),
  };
}

/** "$ 4.345,40" — pesos with cents only when there are cents. */
export function moneyGasto(n: number): string {
  const cents = Math.round(n * 100) % 100 !== 0;
  return "$ " + n.toLocaleString("es-CO", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 });
}
