import { describe, it, expect } from "vitest";
import {
  parseCsv,
  parseCsvRecords,
  validateProductos,
  validateIngredientes,
} from "@/lib/importacion";

describe("parseCsv", () => {
  it("splits simple rows and columns", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });
  it("respects quoted fields containing commas", () => {
    expect(parseCsv('name,price\n"Burger, doble",24900')).toEqual([
      ["name", "price"],
      ["Burger, doble", "24900"],
    ]);
  });
  it("unescapes doubled quotes", () => {
    expect(parseCsv('a\n"he said ""hi"""')).toEqual([["a"], ['he said "hi"']]);
  });
  it("handles CRLF line endings and a trailing newline", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("parseCsvRecords", () => {
  it("keys rows by lowercased header and skips blank lines", () => {
    const { header, records } = parseCsvRecords("Name,SKU\n\nBurger,HB-1\n");
    expect(header).toEqual(["name", "sku"]);
    expect(records).toEqual([{ name: "Burger", sku: "HB-1" }]);
  });
});

describe("validateProductos", () => {
  it("accepts valid rows and uppercases the SKU", () => {
    const r = validateProductos([{ name: "Burger", sku: "hb-1", price_cop: "24900" }]);
    expect(r[0].error).toBeNull();
    expect(r[0].data).toEqual({ name: "Burger", sku: "HB-1", price_cop: 24900 });
  });
  it("rejects missing name / sku / bad price", () => {
    const r = validateProductos([
      { name: "", sku: "X", price_cop: "1" },
      { name: "A", sku: "", price_cop: "1" },
      { name: "A", sku: "X", price_cop: "abc" },
    ]);
    expect(r.map((x) => x.error)).toEqual([
      "Falta el nombre.",
      "Falta el SKU.",
      "Precio inválido.",
    ]);
    expect(r.every((x) => x.data === null)).toBe(true);
  });
});

describe("validateIngredientes", () => {
  it("defaults stock_min to 0 when omitted", () => {
    const r = validateIngredientes([{ name: "Pan", unit: "und", cost_cop: "1100" }]);
    expect(r[0].error).toBeNull();
    expect(r[0].data).toEqual({ name: "Pan", unit: "und", cost_cop: 1100, stock_min: 0 });
  });
  it("rejects a missing unit", () => {
    const r = validateIngredientes([{ name: "Pan", unit: "", cost_cop: "1100" }]);
    expect(r[0].error).toBe("Falta la unidad.");
  });
});
