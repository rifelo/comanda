/**
 * Pure CSV parsing + validation for the Importación module. No I/O — the
 * bulk insert lives in the server action; this is unit-tested in
 * importacion.test.ts.
 */

export type ImportType = "productos" | "ingredientes";

export interface ProductoImport {
  name: string;
  sku: string;
  price_cop: number;
}
export interface IngredienteImport {
  name: string;
  unit: string;
  cost_cop: number;
  stock_min: number;
}

export interface ParsedRow<T> {
  /** 1-based line number in the data (excludes the header). */
  row: number;
  data: T | null;
  error: string | null;
}

export const IMPORT_COLUMNS: Record<ImportType, string[]> = {
  productos: ["name", "sku", "price_cop"],
  ingredientes: ["name", "unit", "cost_cop", "stock_min"],
};

/** Minimal RFC-4180-ish CSV parser: quoted fields, escaped quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const src = text.replace(/\r\n?/g, "\n");

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  // Flush the trailing field/row unless the input ended on a newline.
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Parse CSV text into header-keyed records (skips fully blank lines). */
export function parseCsvRecords(text: string): {
  header: string[];
  records: Record<string, string>[];
} {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
  if (rows.length === 0) return { header: [], records: [] };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const records = rows.slice(1).map((r) => {
    const rec: Record<string, string> = {};
    header.forEach((h, i) => (rec[h] = (r[i] ?? "").trim()));
    return rec;
  });
  return { header, records };
}

function intField(rec: Record<string, string>, key: string): number | null {
  const raw = rec[key];
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

export function validateProductos(
  records: ReadonlyArray<Record<string, string>>,
): ParsedRow<ProductoImport>[] {
  return records.map((rec, i) => {
    const name = (rec.name ?? "").trim();
    const sku = (rec.sku ?? "").trim().toUpperCase();
    const price_cop = intField(rec, "price_cop");
    let error: string | null = null;
    if (!name) error = "Falta el nombre.";
    else if (!sku) error = "Falta el SKU.";
    else if (price_cop == null) error = "Precio inválido.";
    return {
      row: i + 1,
      data: error ? null : { name, sku, price_cop: price_cop! },
      error,
    };
  });
}

export function validateIngredientes(
  records: ReadonlyArray<Record<string, string>>,
): ParsedRow<IngredienteImport>[] {
  return records.map((rec, i) => {
    const name = (rec.name ?? "").trim();
    const unit = (rec.unit ?? "").trim();
    const cost_cop = intField(rec, "cost_cop");
    const stock_min = rec.stock_min ? intField(rec, "stock_min") : 0;
    let error: string | null = null;
    if (!name) error = "Falta el nombre.";
    else if (!unit) error = "Falta la unidad.";
    else if (cost_cop == null) error = "Costo inválido.";
    else if (stock_min == null) error = "Umbral mínimo inválido.";
    return {
      row: i + 1,
      data: error ? null : { name, unit, cost_cop: cost_cop!, stock_min: stock_min! },
      error,
    };
  });
}

export function validateRows(
  type: ImportType,
  records: ReadonlyArray<Record<string, string>>,
): ParsedRow<ProductoImport | IngredienteImport>[] {
  return type === "productos"
    ? validateProductos(records)
    : validateIngredientes(records);
}
