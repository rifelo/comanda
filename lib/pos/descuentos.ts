/**
 * Descuentos del POS (mig 0085) — pure pricing, shared by the register's
 * preview, the server actions and the owner's approval page.
 *
 * A rule is either a special unit price for one product («Tinto a $2.000»)
 * or a percentage off the whole order. Rules re-price the LINES (not the
 * order total), so everything that adds up lines — combining, splitting by
 * person, receipts — keeps matching. Modifier extras stay on top of a special
 * price: a «Tinto a $2.000» with a +$1.000 option costs $3.000.
 */
import type { PosCatalog } from "./types";
import { lineUnitPrice, type OrderLineInput } from "./lineas";

export type DescuentoRegla =
  | { tipo: "precio"; productoId: string; precio: number }
  | { tipo: "porcentaje"; porcentaje: number };

export type DescuentoEstado = "pendiente" | "aprobado" | "rechazado" | "anulado";

/** What the register shows on an order card. */
export interface OrderDescuento {
  id: string;
  estado: DescuentoEstado;
  label: string;
  motivo: string;
}

/** A line to price: its list unit (catalog + options) when known, else the stored one. */
export interface LineaDescuento {
  kind: "item" | "combo";
  productoId: string | null;
  qty: number;
  /** List unit price (catalog base + option extras). */
  unit: number;
  /** Catalog base price of the product (no options); null for combos / unknown. */
  base: number | null;
}

const peso = (n: number) => Math.max(0, Math.round(n));
/** Percent prices land on round hundreds (cash-friendly). */
const cien = (n: number) => Math.max(0, Math.round(n / 100) * 100);

/**
 * Latest rule wins: one special price per product, one percentage per order.
 * `reglas` must come oldest → newest.
 */
export function vigentes(reglas: ReadonlyArray<DescuentoRegla>): DescuentoRegla[] {
  const precio = new Map<string, DescuentoRegla>();
  let pct: DescuentoRegla | null = null;
  for (const r of reglas) {
    if (r.tipo === "precio") precio.set(r.productoId, r);
    else pct = r;
  }
  return [...precio.values(), ...(pct ? [pct] : [])];
}

/** Discounted unit of every line, plus list subtotal, total and discount. */
export function aplicarDescuentos(
  lineas: ReadonlyArray<LineaDescuento>,
  reglas: ReadonlyArray<DescuentoRegla>,
): { units: number[]; subtotal: number; total: number; descuento: number } {
  const rs = vigentes(reglas);
  const pct = rs.find((r) => r.tipo === "porcentaje") as Extract<DescuentoRegla, { tipo: "porcentaje" }> | undefined;
  const units = lineas.map((l) => {
    let u = l.unit;
    if (l.kind === "item" && l.productoId && l.base !== null) {
      const r = rs.find((x) => x.tipo === "precio" && x.productoId === l.productoId) as Extract<DescuentoRegla, { tipo: "precio" }> | undefined;
      if (r) u = peso(u - Math.max(0, l.base - r.precio));
    }
    if (pct) u = Math.min(u, cien(u * (1 - pct.porcentaje / 100)));
    return u;
  });
  const subtotal = lineas.reduce((s, l) => s + l.unit * l.qty, 0);
  const total = lineas.reduce((s, l, i) => s + units[i] * l.qty, 0);
  return { units, subtotal, total, descuento: subtotal - total };
}

/**
 * Lines of a stored order as `LineaDescuento`: priced from the live catalog
 * when the product is still there (so a discount always starts from the list
 * price, never from an already discounted one), else the stored unit.
 */
export function lineasDeOrden(
  catalog: PosCatalog,
  items: ReadonlyArray<{ kind: "item" | "combo"; productoId: string | null; comboId: string | null; qty: number; unitPrice: number; mods: OrderLineInput["mods"] }>,
): LineaDescuento[] {
  return items.map((it) => {
    const id = it.kind === "item" ? it.productoId : it.comboId;
    const priced = id ? lineUnitPrice(catalog, { kind: it.kind, id, qty: it.qty, mods: it.mods ?? {} }) : null;
    const base = it.kind === "item" && it.productoId ? catalog.byId[it.productoId]?.price ?? null : null;
    return { kind: it.kind, productoId: it.productoId, qty: it.qty, unit: priced ? priced.unit : it.unitPrice, base };
  });
}

const fmt = (n: number) => "$" + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** «Tinto a $2.000 c/u» · «10 % a todo el pedido». */
export function etiquetaDescuento(d: { tipo: "precio" | "porcentaje"; producto_nombre?: string | null; precio_cop?: number | null; porcentaje?: number | string | null }): string {
  if (d.tipo === "precio") return `${d.producto_nombre ?? "Producto"} a ${fmt(Number(d.precio_cop ?? 0))} c/u`;
  const p = Number(d.porcentaje ?? 0);
  return `${Number.isInteger(p) ? p : p.toFixed(1).replace(".", ",")} % a todo el pedido`;
}

/** The WhatsApp text the register sends to the owner (the link goes last). */
export function mensajeAprobacion(input: {
  folio: string;
  etiqueta: string;
  antes: number;
  despues: number;
  motivo: string;
  pide: string | null;
  link: string;
}): string {
  return [
    `Descuento por aprobar · Pedido ${input.folio}`,
    input.etiqueta,
    `Total: ${fmt(input.antes)} → ${fmt(input.despues)}`,
    `Motivo: ${input.motivo}`,
    input.pide ? `Lo pide: ${input.pide}` : null,
    "",
    `Aprobar o rechazar: ${input.link}`,
  ]
    .filter((x) => x !== null)
    .join("\n");
}

export const formatoPesos = fmt;
