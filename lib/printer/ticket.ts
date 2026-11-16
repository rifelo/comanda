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
  type ComandaCapa,
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
  /** Ficha técnica por capas for the size and options of the line. */
  capas?: ComandaCapa[];
  extras?: ComandaProporcion[];
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
export const limpio = (name: string) => name.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\bcafe\b/i, "Café").replace(/\s+/g, " ").trim();

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
  /** Its preparation steps (modifier_options.preparacion), one per line. */
  prep?: string;
}

/** An option that is a foam of its own (Cold foam, Cold foam de matcha): its lines stay apart, in Espuma. */
const ES_FOAM = /foam|espuma/i;

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
      // A foam keeps its own lines (its 20 ml of leche is not the drink's leche).
      const hit = ES_FOAM.test(o.opcion) ? undefined : out.find((r) => r.name === x.name);
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

/** «16 oz», «16oz»: the size option of a line. */
const ES_16 = /^16\s*oz$/i;

/**
 * The ficha técnica por capas for one line: the 16 oz amounts when the line
 * has the 16 oz option, a swapped ingredient (Deslactosada) under its new
 * name, and what other options add listed apart («+20 ml Syrup de vainilla»).
 * The layer's «nota verificable» stays on the ficha, not on the comanda (owner, 2026-11-16).
 */
export function capasDe(bloques: NonNullable<PosMenuItem["capas"]>, opciones: readonly OpcionReceta[]): { capas: ComandaCapa[]; extras: ComandaProporcion[] } {
  const es16 = opciones.some((o) => ES_16.test(o.opcion.trim()));
  const swaps = new Map<string, { name: string; opcion: string }>();
  const extras: ComandaProporcion[] = [];
  for (const o of opciones) {
    if (ES_16.test(o.opcion.trim())) continue;
    for (const x of o.recipe) {
      if (x.reemplaza && x.reemplaza !== x.name) swaps.set(x.reemplaza, { name: x.name, opcion: o.opcion });
      else if (!x.reemplaza && x.qty > 0 && !/etiqueta/i.test(x.name)) {
        const unit = /^(und|unidad|unidades)$/i.test(x.unit) ? "" : x.unit;
        extras.push({ cantidad: `${cantidad(x.qty)}${unit ? ` ${unit}` : ""}`, nombre: limpio(x.name), nota: o.opcion });
      }
    }
    if (o.prep?.trim()) extras.push({ cantidad: "", nombre: pasosEnLinea(o.prep), nota: o.opcion });
  }
  const capas: ComandaCapa[] = [];
  for (const b of bloques) {
    const grupo = b.tipo === "grupo" ? [b.op, b.nota].filter(Boolean).join(" · ") : undefined;
    for (const c of b.tipo === "capa" ? [b.capa] : b.capas) {
      capas.push({
        n: c.n,
        capa: c.label,
        ...(c.ops.length ? { ops: c.ops.join(" + ") } : {}),
        lineas: c.lineas.map((l) => {
          const sw = l.ingName ? swaps.get(l.ingName) : undefined;
          const texto = sw ? `${limpio(sw.name)} · ${sw.opcion}` : l.texto;
          const t16 = l.t16.replace(/\s*\(× [\d,]+\)$/, "");
          // A swapped container (vaso 12 → 16) shows its new name as the text.
          if (es16 && t16 && !l.t12) return { texto: t16 };
          if (es16 && t16 && /^[\d,]+\s/.test(t16)) return { cantidad: t16, texto };
          if (es16 && t16) return { texto: t16 };
          return l.t12 ? { cantidad: l.t12, texto } : { texto };
        }),
        ...(grupo ? { grupo } : {}),
      });
    }
  }
  return { capas: espressoAntesDeLaLeche(capas), extras };
}

/**
 * Hot drinks with milk are the one exception to bottom-up (owner, 2026-11-16):
 * the milk is texturized first, but in the cup the espresso (5) goes before
 * the texturized milk (4, which brings the foam with it). A layer list with no
 * Hielo (and no blender box) whose Cuerpo is leche prints 5 before 4.
 */
export function espressoAntesDeLaLeche<T extends { n: number; lineas: ReadonlyArray<{ texto: string }>; grupo?: string }>(capas: T[]): T[] {
  // Cold (Hielo) or blended (a Licuar box) drinks keep bottom-up.
  if (capas.some((c) => c.n === 3 || c.grupo)) return capas;
  const i4 = capas.findIndex((c) => c.n === 4);
  const i5 = capas.findIndex((c) => c.n === 5);
  if (i4 < 0 || i5 < 0 || i5 < i4) return capas;
  if (!capas[i4].lineas.some((l) => /leche/i.test(l.texto))) return capas;
  const out = capas.slice();
  const [cinco] = out.splice(i5, 1);
  out.splice(i4, 0, cinco);
  return out;
}

/** The 8 layers in order (number, name), for drinks whose recipe has no ficha yet. */
const CAPAS_COMANDA = [
  [1, "Vaso"], [2, "Fondo"], [3, "Hielo"], [4, "Cuerpo"], [5, "Protagonista"], [6, "Espuma"], [7, "Decoración"], [8, "Cierre"],
] as const;
/**
 * Which layer a recipe line belongs to, by its name. Checked in this order:
 * containers and lids first, then the specific ones (condensada before leche).
 */
export function capaDeInsumo(name: string): number {
  const n = name.toLowerCase();
  if (/\bvaso\b|etiqueta|botella 330/.test(n)) return 1;
  if (/\btapa\b|pitillo|palito|panela|domo|servilleta|portavaso|aislador|protector de calor/.test(n)) return 8;
  if (/^hielo/.test(n)) return 3;
  if (/rich|crema para batir|whip|cápsula|chantilly/.test(n)) return 6;
  if (/salsa de|canela|cacao|jugo de limón/.test(n)) return 7;
  if (/condensada|syrup|jarabe|azúcar|esencia|chocolate/.test(n)) return 2;
  if (/leche|\bagua\b|soda|ginger|tónica|canada dry/.test(n)) return 4;
  return 5;
}

/**
 * A drink without a ficha por capas still prints in the layer pattern: each
 * recipe line (options applied) goes to its layer, numbered 1–8; blended
 * drinks (pulpa, base de malteada, leche en polvo) get Fondo…Protagonista in a
 * «Licuar» box.
 */
/** «a\nb\nc» → «a → b → c», for a one-line nota on the comanda. */
function pasosEnLinea(prep: string): string {
  return prep.split(/\n+/).map((s) => s.replace(/^\s*\d+[.)]\s*/, "").trim()).filter(Boolean).join(" → ");
}

export function capasDesdeReceta(lineas: PosMenuItem["recipe"], opciones: readonly OpcionReceta[] = []): ComandaCapa[] {
  const por = new Map<number, { cantidad?: string; texto: string }[]>();
  const licuada = lineas.some((r) => /pulpa|base malteada|leche en polvo/i.test(r.name));
  const caliente = !lineas.some((r) => /^hielo/i.test(r.name));
  for (const r of lineas) {
    const n = ES_FOAM.test(r.note ?? "") ? 6 : capaDeInsumo(r.name);
    const unit = /^(und|unidad|unidades|etiqueta|sobre)$/i.test(r.unit) ? "" : r.unit;
    const nota = n !== 1 && r.note?.trim() && !/^nombre, qr/i.test(r.note.trim()) ? ` · ${r.note.trim()}` : "";
    const arr = por.get(n) ?? [];
    arr.push({ cantidad: `${cantidad(r.qty)}${unit ? ` ${unit}` : ""}`, texto: `${limpio(r.name)}${nota}` });
    por.set(n, arr);
  }
  const ops: Record<number, string> = {
    1: "Pegar", 2: "Verter", 3: "Verter",
    4: caliente && (por.get(4) ?? []).some((l) => /leche/i.test(l.texto)) ? "Texturizar" : "Verter",
    5: (por.get(5) ?? []).some((l) => /caf[eé] okana|espresso/i.test(l.texto)) ? "Extraer + Verter" : licuada ? "Agregar" : "Disolver + Verter",
    6: "Batir", 7: "Decorar", 8: "Tapar + Servir",
  };
  const out: ComandaCapa[] = [];
  for (const [n, capa] of CAPAS_COMANDA) {
    const lin = por.get(n);
    if (!lin?.length) continue;
    const enLicuadora = licuada && n >= 2 && n <= 5;
    out.push(enLicuadora ? { n, capa, lineas: lin, grupo: "Licuar · hasta que no queden trozos" } : { n, capa, ops: ops[n], lineas: lin });
  }
  // An option's preparation goes on the layer where its lines landed.
  for (const o of opciones) {
    if (!o.prep?.trim()) continue;
    const c = out.find((x) => x.lineas.some((l) => l.texto.includes(`· ${o.opcion}`)));
    if (c) c.nota = [c.nota, `${o.opcion}: ${pasosEnLinea(o.prep)}`].filter(Boolean).join(" · ");
  }
  return espressoAntesDeLaLeche(out);
}

export function recetaDe(p: Pick<PosMenuItem, "printsLabel" | "prep" | "recipe" | "capas">, opciones: readonly OpcionReceta[] = []): RecetaInfo {
  if (!p.printsLabel) return { bebida: false, pasos: [] };
  if (p.capas?.length) {
    const { capas, extras } = capasDe(p.capas, opciones);
    return { bebida: true, pasos: [], capas, ...(extras.length ? { extras } : {}) };
  }
  const receta = opciones.length ? conOpciones(p.recipe, opciones) : p.recipe;
  if (receta.length) return { bebida: true, pasos: [], capas: capasDesdeReceta(receta, opciones) };
  const proporciones: ComandaProporcion[] = [];
  const envase: string[] = [];
  for (const r of receta) {
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
        if (o?.recipe?.length || o?.prep || (o && ES_16.test(o.name.trim()))) { opciones.push({ opcion: o.name, recipe: o.recipe ?? [], ...(o.prep ? { prep: o.prep } : {}) }); break; }
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
    if (r?.bebida) bebidas.push({ nombre: l.name, cantidad: l.qty, modificadores: l.mods, cliente, proporciones: r.proporciones, envase: r.envase, pasos: r.pasos, ...(r.capas ? { capas: r.capas } : {}), ...(r.extras ? { extras: r.extras } : {}) });
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
