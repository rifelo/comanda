import { z } from "zod";
import type { PosMenuItem, PosModGroup } from "@/lib/pos/types";
import {
  fechaCorta,
  hora12,
  renderComandaBarraHtml,
  renderPrecuentaHtml,
  type ComandaBebida,
  type ComandaData,
  type ComandaOtro,
  type ComandaPaso,
  type ComandaProporcion,
  type Papel,
  type PrecuentaData,
  paso,
} from "./tirillas";

/**
 * Paper tickets for the 80 mm receipt printer (DigitalPOS DIG-E200I on the
 * register, installed as a Windows printer): the customer's receipt and the
 * barista's comanda.
 *
 * A ticket is data first (TicketDoc), so a tablet with no printer can relay
 * it through pos_print_jobs like the labels; the station that prints turns it
 * into the tirilla of the canvas (lib/printer/tirillas.ts: Precuenta for the
 * customer, Comanda de barra with the recipes from ITS catalog by SKU) and
 * hands it to the browser's print — silent when Edge runs with
 * --kiosk-printing and the DIG-E200I is the default printer.
 */
const text = (max: number) => z.string().max(max);

const TicketLineSchema = z.object({
  qty: z.number().int().min(1).max(999),
  name: text(120),
  /** Chosen options (size, milk…), already as words. */
  mods: z.array(text(60)).max(12),
  /** Person the line is for, when the order has several. */
  customer: text(60).optional(),
  /** Line total (qty × unit with options); receipts only. */
  total: z.number().int().optional(),
  /** Catalog SKU: the station looks the recipe up by it (never sent with the order). */
  sku: text(40).optional(),
});
export type TicketLine = z.infer<typeof TicketLineSchema>;

export const TicketDocSchema = z.object({
  kind: z.enum(["recibo", "comanda"]),
  folio: text(24),
  /** When the order was taken (ISO). */
  at: text(40),
  orgName: text(120),
  /** Receipt header lines under the name (NIT, address, phone…). */
  encabezado: text(300).nullable().optional(),
  /** Receipt footer («¡Gracias…!», wifi, Instagram…). */
  pie: text(200).nullable().optional(),
  customer: text(120).optional(),
  orderType: z.enum(["aqui", "llevar", "domicilio"]).optional(),
  seLoLlevamos: z.boolean().optional(),
  sinGluten: z.boolean().optional(),
  note: text(400).optional(),
  barista: text(80).optional(),
  lines: z.array(TicketLineSchema).min(1).max(80),
  total: z.number().int().optional(),
  /** Payment method label («Efectivo»…); absent = not paid yet. */
  method: text(40).optional(),
  tendered: z.number().int().nullable().optional(),
  change: z.number().int().optional(),
  approval: text(40).nullable().optional(),
  /** Paid in parts with several methods («Mixto»): one row per part. */
  partes: z.array(z.object({ metodo: text(40), monto: z.number().int() })).max(20).optional(),
  /** Sent to pay later («pagar después» / transfer not seen yet). */
  pendiente: z.boolean().optional(),
  porVerificar: z.boolean().optional(),
  /** Printed again (from Pedidos or the receipt screen). */
  copia: z.boolean().optional(),
});
export type TicketDoc = z.infer<typeof TicketDocSchema>;

// ── formatting (kept for callers; the tirillas have their own) ──
export { pesos } from "./tirillas";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** «31 oct 2026 · 22:31» in Bogotá time (UTC−5, no DST). */
export function fechaBogota(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const d = new Date(t - 5 * 3600_000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()} · ${hh}:${mm}`;
}

// ── TicketDoc → the canvas tirillas ─────────────────────────────
export type { Papel };

/** What the station's catalog knows about a product, by SKU. */
export interface RecetaInfo {
  /** A prepared drink (gets the cup labels). Food and bottles: false. */
  bebida: boolean;
  /** Ingredients with their amounts, in recipe order (no packaging, no labels). */
  proporciones?: ComandaProporcion[];
  /** «Vaso 12 oz doble pared · Tapa domo Darnel 12 oz». */
  envase?: string;
  /** Written steps, used only when the recipe has no ingredient lines. */
  pasos: ComandaPaso[];
}
/** SKU (+ the options chosen on that line) → what the comanda prints for it. */
export type RecetaLookup = (sku: string, mods?: readonly string[]) => RecetaInfo | null;

/** 18 → «18», 12,5 → «12,5», 0,04 → «0,04»: never rounds a small amount down to 0. */
export function cantidad(n: number): string {
  const r = Number(n.toFixed(Math.abs(n) < 1 ? 3 : Math.abs(n) < 10 ? 2 : 1));
  return String(r).replace(".", ",");
}
/** What goes around the drink, not in it: its own short line on the comanda. */
const ENVASE = /\b(vaso|tapa|domo|pitillo|aislador|sleeve|servilleta|mezclador|cuchar|bolsa para|portavaso)/i;
/** «Leche entera Gran Vía (bolsa 900 ml)» → «Leche entera Gran Vía»; «Cafe Okana» → «Café Okana». */
const limpio = (name: string) => name.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\bcafe\b/i, "Café").replace(/\s+/g, " ").trim();

/**
 * The comanda's view of a catalog product: for a drink (the ones that get
 * cup labels), its ingredients with amounts in recipe order — the thing the
 * bar needs at a glance — plus the container; the label stickers are left
 * out. Written prep steps are kept only as a fallback for drinks whose
 * recipe has no ingredient lines.
 */
export interface OpcionReceta {
  /** The option's name («En leche», «16 oz»), noted on the lines it changes. */
  opcion: string;
  recipe: ReadonlyArray<{ name: string; qty: number; unit: string; reemplaza?: string }>;
}

/**
 * The base recipe with the chosen options applied (modifier_option_receta):
 * an ingredient already in the recipe changes its amount (a negative amount
 * takes it out — 16 oz swaps the 12 oz cup); a new one is added at the end.
 * Lines an option touched say so («· En leche»).
 */
export function conOpciones(
  recipe: readonly PosMenuItem["recipe"][number][],
  opciones: readonly OpcionReceta[],
): PosMenuItem["recipe"] {
  const out = recipe.map((r) => ({ ...r }));
  for (const o of opciones) {
    for (const x of o.recipe) {
      if (x.reemplaza) {
        // A swap: that line becomes this ingredient (same amount × qty).
        const was = out.find((r) => r.name === x.reemplaza);
        if (was) {
          was.name = x.name;
          was.unit = x.unit;
          was.qty *= x.qty;
          was.note = [was.note, o.opcion].filter(Boolean).join(" · ");
        }
        continue;
      }
      const hit = out.find((r) => r.name === x.name);
      if (hit) {
        hit.qty += x.qty;
        hit.note = [hit.note, o.opcion].filter(Boolean).join(" · ");
      } else if (x.qty > 0) {
        out.push({ name: x.name, qty: x.qty, unit: x.unit, note: o.opcion });
      }
    }
  }
  return out.filter((r) => r.qty > 0.0005);
}

export function recetaDe(p: Pick<PosMenuItem, "printsLabel" | "prep" | "recipe">, opciones: readonly OpcionReceta[] = []): RecetaInfo {
  if (!p.printsLabel) return { bebida: false, pasos: [] };
  const proporciones: ComandaProporcion[] = [];
  const envase: string[] = [];
  for (const r of opciones.length ? conOpciones(p.recipe, opciones) : p.recipe) {
    if (/^etiqueta/i.test(r.unit) || /etiqueta/i.test(r.name)) continue;
    if (ENVASE.test(r.name)) { envase.push(limpio(r.name)); continue; }
    const unit = /^(und|unidad|unidades)$/i.test(r.unit) ? "" : r.unit;
    proporciones.push({ cantidad: `${cantidad(r.qty)}${unit ? ` ${unit}` : ""}`, nombre: limpio(r.name), ...(r.note?.trim() ? { nota: r.note.trim() } : {}) });
  }
  return {
    bebida: true,
    ...(proporciones.length ? { proporciones } : {}),
    ...(envase.length ? { envase: envase.join(" · ") } : {}),
    pasos: proporciones.length ? [] : p.prep.map(paso),
  };
}

/**
 * SKU (+ options) → recipe for the whole menu (what the station passes to
 * setTicketRecetas). Options are matched by name within the product's own
 * modifier groups, as the line carries them.
 */
export function recetasDelMenu(menu: readonly PosMenuItem[], modGroups: Readonly<Record<string, PosModGroup>> = {}): RecetaLookup {
  const bySku = new Map(menu.filter((p) => p.sku).map((p) => [p.sku, p] as const));
  return (sku, mods = []) => {
    const p = bySku.get(sku);
    if (!p) return null;
    const opciones: OpcionReceta[] = [];
    for (const name of mods) {
      for (const gid of p.mods) {
        const o = modGroups[gid]?.options.find((x) => x.name === name);
        if (o?.recipe?.length) { opciones.push({ opcion: o.name, recipe: o.recipe }); break; }
      }
    }
    return recetaDe(p, opciones);
  };
}

export interface TicketPrintOptions {
  papel?: Papel;
  /** One-ink icon as a data: URI (or URL) for the top of both tirillas. */
  logo?: string | null;
  /** Recipes from this station's catalog. Without it every line prints as «otros». */
  recetas?: RecetaLookup;
}

const marca = (d: TicketDoc, logo: string | null | undefined) => ({
  nombre: d.orgName,
  logo: logo ?? null,
  encabezado: d.encabezado ?? null,
  pie: d.pie ?? null,
});
const pedido = (folio: string) => (folio.startsWith("#") ? folio : `#${folio}`);

export function toPrecuenta(d: TicketDoc, logo?: string | null): PrecuentaData {
  const items = d.lines.map((l) => ({
    cantidad: l.qty,
    nombre: l.name,
    detalle: l.mods,
    unitario: l.total != null ? Math.round(l.total / l.qty) : undefined,
    total: l.total ?? 0,
  }));
  const subtotal = items.reduce((s, it) => s + it.total, 0);
  return {
    marca: marca(d, logo),
    cliente: d.customer,
    pedido: pedido(d.folio),
    fecha: fechaCorta(d.at),
    hora: hora12(d.at),
    items,
    subtotal,
    total: d.total ?? subtotal,
    pago: d.method && !d.pendiente
      ? { metodo: d.method, recibido: d.tendered ?? null, cambio: d.change, aprobacion: d.approval ?? null, partes: d.partes }
      : undefined,
    estado: d.pendiente ? (d.porVerificar ? "por-verificar" : "pendiente") : undefined,
    copia: d.copia,
  };
}

/**
 * Whether a comanda prints: the order has at least one prepared drink. When
 * in doubt it prints — recipes not loaded yet (an outbox flush right at
 * start-up), a line with no SKU or one this catalog doesn't know — because a
 * missing comanda is worse than an extra one. Only an order whose every line
 * is known food or bottles skips it.
 */
export function tieneBebidas(d: Pick<TicketDoc, "lines">, recetas: RecetaLookup | undefined): boolean {
  if (!recetas) return true;
  return d.lines.some((l) => {
    if (!l.sku) return true;
    const r = recetas(l.sku, l.mods);
    return r === null || r.bebida;
  });
}

export function toComandaBarra(d: TicketDoc, opts: { logo?: string | null; recetas?: RecetaLookup } = {}): ComandaData {
  const bebidas: ComandaBebida[] = [];
  const otros: ComandaOtro[] = [];
  const several = new Set(d.lines.map((l) => l.customer?.trim() ?? "")).size > 1;
  for (const l of d.lines) {
    const r = l.sku ? opts.recetas?.(l.sku, l.mods) ?? null : null;
    const cliente = several && l.customer?.trim() ? l.customer.trim() : undefined;
    if (r?.bebida) bebidas.push({ nombre: l.name, cantidad: l.qty, modificadores: l.mods, cliente, proporciones: r.proporciones, envase: r.envase, pasos: r.pasos });
    else otros.push({ nombre: l.name, cantidad: l.qty, modificadores: l.mods, cliente });
  }
  const avisos: string[] = [];
  if (d.seLoLlevamos) avisos.push("SE LO LLEVAMOS");
  if (d.orderType === "llevar") avisos.push("PARA LLEVAR");
  if (d.orderType === "domicilio") avisos.push("DOMICILIO");
  if (d.sinGluten) avisos.push("SIN GLUTEN");
  return {
    marca: marca(d, opts.logo),
    pedido: pedido(d.folio),
    hora: hora12(d.at),
    cliente: d.customer,
    barista: d.barista,
    bebidas,
    otros,
    avisos,
    nota: d.note,
    estado: d.pendiente ? (d.porVerificar ? "Transferencia por verificar" : "Pendiente de pago") : undefined,
    copia: d.copia,
  };
}

export function renderTicketHtml(d: TicketDoc, opts: TicketPrintOptions = {}): string {
  const papel = opts.papel ?? "80";
  return d.kind === "recibo"
    ? renderPrecuentaHtml(toPrecuenta(d, opts.logo), papel)
    : renderComandaBarraHtml(toComandaBarra(d, opts), papel);
}
