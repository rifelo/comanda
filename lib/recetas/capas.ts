/**
 * Ficha técnica por capas (productos.capas, mig 0087). Every drink is built
 * in the same fixed order — Vaso · Base dulce · Hielo · Cuerpo · Carga ·
 * Espuma · Topping · Cierre — and a layer that does not apply is left out
 * (its number is kept, so the Milo frío goes 1 → 3). A layer may carry one or
 * more operations («Tapar + Servir») and a verifiable note; consecutive
 * layers may be grouped under one operation («Licuar» on Base … Carga).
 *
 * Quantities of inventory items live on the layer line itself (the milk is
 * split 150 ml body + 20 ml foam), and `cuadreReceta` checks they add up to
 * the recipe, so the sheet and the stock deduction never drift apart. The
 * 16 oz column comes from the «16 oz» option: its swaps (vaso 12 → 16) and
 * its scale rows (leche × 1,33).
 *
 * Pure (no I/O): shared by the admin editor, the POS sheet and the tests.
 */

export const CAPAS = [
  { key: "vaso", label: "Vaso", n: 1 },
  { key: "base", label: "Base dulce", n: 2 },
  { key: "hielo", label: "Hielo", n: 3 },
  { key: "cuerpo", label: "Cuerpo", n: 4 },
  { key: "carga", label: "Carga", n: 5 },
  { key: "espuma", label: "Espuma", n: 6 },
  { key: "topping", label: "Topping", n: 7 },
  { key: "cierre", label: "Cierre", n: 8 },
] as const;
export type CapaKey = (typeof CAPAS)[number]["key"];

export const OPERACIONES = [
  { key: "pegar", label: "Pegar" },
  { key: "disolver", label: "Disolver" },
  { key: "batir", label: "Batir" },
  { key: "revolver", label: "Revolver" },
  { key: "verter", label: "Verter" },
  { key: "extraer", label: "Extraer" },
  { key: "texturizar", label: "Texturizar" },
  { key: "licuar", label: "Licuar" },
  { key: "espolvorear", label: "Espolvorear" },
  { key: "decorar", label: "Decorar" },
  { key: "tapar", label: "Tapar" },
  { key: "servir", label: "Servir" },
] as const;
export type Operacion = (typeof OPERACIONES)[number]["key"];

/** A line of a layer: an inventory item with its amount, or free text. */
export interface CapaItem {
  /** ingrediente id; its amount for 12 oz is `qty`, in the ingredient's unit. */
  ing?: string;
  qty?: number;
  /** Free text (water, a technique) and its 16 oz version, if any. */
  texto?: string;
  texto16?: string;
}
export interface CapaDef {
  capa: CapaKey;
  ops: Operacion[];
  nota?: string;
  items: CapaItem[];
}
export interface GrupoDef {
  desde: CapaKey;
  hasta: CapaKey;
  op: Operacion;
  nota?: string;
}
export interface FichaCapas {
  capas: CapaDef[];
  grupos: GrupoDef[];
}

const CAPA_N = new Map<string, number>(CAPAS.map((c) => [c.key, c.n]));
const CAPA_LABEL = new Map<string, string>(CAPAS.map((c) => [c.key, c.label]));
const OP_LABEL = new Map<string, string>(OPERACIONES.map((o) => [o.key, o.label]));
export const capaLabel = (k: string) => CAPA_LABEL.get(k) ?? k;
export const opLabel = (k: string) => OP_LABEL.get(k) ?? k;

const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

/** Tolerant read of productos.capas: unknown layers/ops are dropped, layers sorted. Null when empty. */
export function parseFichaCapas(raw: unknown): FichaCapas | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { capas?: unknown; grupos?: unknown };
  const capas: CapaDef[] = [];
  for (const c of Array.isArray(r.capas) ? r.capas : []) {
    const capa = (c as { capa?: unknown })?.capa;
    if (typeof capa !== "string" || !CAPA_N.has(capa) || capas.some((x) => x.capa === capa)) continue;
    const o = c as { ops?: unknown; nota?: unknown; items?: unknown };
    const ops = (Array.isArray(o.ops) ? o.ops : []).filter((x): x is Operacion => typeof x === "string" && OP_LABEL.has(x));
    const items: CapaItem[] = [];
    for (const it of Array.isArray(o.items) ? o.items : []) {
      const i = it as Record<string, unknown>;
      const ing = typeof i?.ing === "string" ? i.ing : undefined;
      const qty = Number(i?.qty);
      const texto = str(i?.texto, 160);
      const texto16 = str(i?.texto16, 160);
      if (ing && Number.isFinite(qty) && qty > 0) items.push({ ing, qty, ...(texto ? { texto } : {}) });
      else if (texto) items.push({ texto, ...(texto16 ? { texto16 } : {}) });
    }
    capas.push({ capa: capa as CapaKey, ops: [...new Set(ops)], ...(str(o.nota, 300) ? { nota: str(o.nota, 300) } : {}), items });
  }
  capas.sort((a, b) => CAPA_N.get(a.capa)! - CAPA_N.get(b.capa)!);
  const grupos: GrupoDef[] = [];
  for (const g of Array.isArray(r.grupos) ? r.grupos : []) {
    const x = g as Record<string, unknown>;
    if (typeof x?.desde !== "string" || typeof x?.hasta !== "string" || typeof x?.op !== "string") continue;
    if (!CAPA_N.has(x.desde) || !CAPA_N.has(x.hasta) || !OP_LABEL.has(x.op)) continue;
    grupos.push({ desde: x.desde as CapaKey, hasta: x.hasta as CapaKey, op: x.op as Operacion, ...(str(x.nota, 300) ? { nota: str(x.nota, 300) } : {}) });
  }
  grupos.sort((a, b) => CAPA_N.get(a.desde)! - CAPA_N.get(b.desde)!);
  return capas.length ? { capas, grupos } : null;
}

/** Why a ficha can't be saved, or null when it's fine. */
export function validarFichaCapas(f: FichaCapas): string | null {
  const vistas = new Set<string>();
  for (const c of f.capas) {
    if (!CAPA_N.has(c.capa)) return `Capa desconocida: ${c.capa}`;
    if (vistas.has(c.capa)) return `La capa ${capaLabel(c.capa)} está dos veces`;
    vistas.add(c.capa);
    if (!c.items.length && !c.ops.length && !c.nota) return `La capa ${capaLabel(c.capa)} está vacía: agrégale un insumo, una operación o una nota, o quítala`;
    for (const it of c.items) {
      if (it.ing && !(Number(it.qty) > 0)) return `Falta la cantidad de un insumo en ${capaLabel(c.capa)}`;
      if (!it.ing && !it.texto) return `Hay una línea vacía en ${capaLabel(c.capa)}`;
    }
  }
  let ultimo = 0;
  for (const g of f.grupos) {
    const a = CAPA_N.get(g.desde) ?? 0;
    const b = CAPA_N.get(g.hasta) ?? 0;
    if (!a || !b || a >= b) return "Un grupo debe ir de una capa a otra posterior";
    if (a <= ultimo) return "Dos grupos se cruzan: una capa solo puede estar en un grupo";
    ultimo = b;
    const dentro = f.capas.filter((c) => { const n = CAPA_N.get(c.capa)!; return n >= a && n <= b; });
    if (dentro.length < 2) return `El grupo «${opLabel(g.op)}» necesita al menos 2 capas activas`;
  }
  return null;
}

/** Sum of each ingredient across the layers vs the recipe: lines that don't match. */
export function cuadreReceta(f: FichaCapas, receta: ReadonlyMap<string, number>): { ing: string; enCapas: number; enReceta: number }[] {
  const suma = new Map<string, number>();
  for (const c of f.capas) for (const it of c.items) if (it.ing) suma.set(it.ing, round2((suma.get(it.ing) ?? 0) + Number(it.qty)));
  const out: { ing: string; enCapas: number; enReceta: number }[] = [];
  for (const [ing, q] of suma) {
    const r = receta.get(ing) ?? 0;
    if (Math.abs(q - r) > 0.01) out.push({ ing, enCapas: q, enReceta: r });
  }
  return out;
}

// ── display ──────────────────────────────────────────────────────────────────

export interface IngInfo {
  name: string;
  unit: string;
}
/** What the «16 oz» option does: scale factor per ingrediente, and swaps (vaso 12 → name of vaso 16). */
export interface Tam16 {
  factor: Record<string, number>;
  swap: Record<string, string>;
}
export interface LineaVista {
  texto: string;
  t12: string;
  /** 16 oz amount, "" when it's the same / there's no 16 oz. */
  t16: string;
  sustituible: boolean;
}
export interface CapaVista {
  n: number;
  key: CapaKey;
  label: string;
  ops: string[];
  nota: string | null;
  lineas: LineaVista[];
}
export type BloqueVista = { tipo: "capa"; capa: CapaVista } | { tipo: "grupo"; op: string; nota: string | null; capas: CapaVista[] };

const round2 = (n: number) => Math.round(n * 100) / 100;
const fmtNum = (n: number) => {
  const r = n >= 10 ? Math.round(n) : round2(n);
  return String(r).replace(".", ",");
};
/** «110 g», «0,87 und». */
export const fmtCant = (qty: number, unit: string) => `${fmtNum(qty)} ${unit}`.trim();
/** «Leche entera Gran Vía (bolsa 900 ml)» → «Leche entera Gran Vía»: the pack size is noise at the bar. */
export const nombreCorto = (name: string) => name.replace(/\s*\([^)]*\)\s*$/, "").trim() || name;

export function armarFicha(f: FichaCapas, ings: ReadonlyMap<string, IngInfo>, tam16: Tam16 | null, sustituibles: ReadonlySet<string> = new Set()): BloqueVista[] {
  const vista = (c: CapaDef): CapaVista => ({
    n: CAPA_N.get(c.capa)!,
    key: c.capa,
    label: capaLabel(c.capa),
    ops: c.ops.map(opLabel),
    nota: c.nota ?? null,
    lineas: c.items.map((it): LineaVista => {
      if (it.ing) {
        const info = ings.get(it.ing);
        const unit = info?.unit ?? "";
        const qty = Number(it.qty);
        let t16 = "";
        if (tam16) {
          const swap = tam16.swap[it.ing];
          const factor = tam16.factor[it.ing];
          if (swap) t16 = `${nombreCorto(swap)}${qty !== 1 ? ` · ${fmtCant(qty, unit)}` : ""}`;
          else if (factor && factor !== 1) t16 = `${fmtCant(qty * factor, unit)} (× ${fmtNum(factor)})`;
        }
        return { texto: it.texto ?? nombreCorto(info?.name ?? "Insumo"), t12: fmtCant(qty, unit), t16, sustituible: sustituibles.has(it.ing) };
      }
      return { texto: it.texto ?? "", t12: "", t16: it.texto16 ?? "", sustituible: false };
    }),
  });
  const out: BloqueVista[] = [];
  let grupoAbierto: GrupoDef | undefined;
  let bloqueAbierto: CapaVista[] = [];
  for (const c of f.capas) {
    const n = CAPA_N.get(c.capa)!;
    const g = f.grupos.find((x) => n >= CAPA_N.get(x.desde)! && n <= CAPA_N.get(x.hasta)!);
    if (!g) {
      grupoAbierto = undefined;
      out.push({ tipo: "capa", capa: vista(c) });
      continue;
    }
    if (grupoAbierto !== g) {
      grupoAbierto = g;
      bloqueAbierto = [];
      out.push({ tipo: "grupo", op: opLabel(g.op), nota: g.nota ?? null, capas: bloqueAbierto });
    }
    bloqueAbierto.push(vista(c));
  }
  return out;
}

const lineaTexto = (l: LineaVista) => [l.texto, l.t12].filter(Boolean).join(" ") + (l.t16 ? ` (16 oz: ${l.t16.replace(/ \(× [\d,]+\)$/, "")})` : "");
const capaTexto = (c: CapaVista) => {
  const head = `${c.label}${c.ops.length ? ` · ${c.ops.join(" + ")}` : ""}`;
  const body = c.lineas.map(lineaTexto).join(" + ");
  return [head, body, c.nota].filter(Boolean).join(" · ");
};

/** One step per block, for productos.preparacion (printed comanda, old clients). */
export function fichaATexto(bloques: ReadonlyArray<BloqueVista>): string {
  return bloques
    .map((b) => (b.tipo === "capa" ? capaTexto(b.capa) : `${b.op}: ${b.capas.map(capaTexto).join(" | ")}${b.nota ? ` · ${b.nota}` : ""}`))
    .join("\n");
}

// ── what the options say about a drink ──────────────────────────────────────

/** One row of modifier_option_receta, with the option's name. */
export interface OpcionRecetaRow {
  optionName: string;
  ingredienteId: string;
  ingredienteName: string;
  reemplazaId: string | null;
  qty: number;
}
export const esOpcion16 = (name: string) => /^16\s*oz$/i.test(name.trim());

/**
 * The 16 oz column out of the «16 oz» option rows: scale rows
 * (ingrediente = reemplaza) give the factor, swaps give the new item's name.
 * Legacy rows «+1 vaso 16, −1 vaso 12» read as a swap too. Null = no 16 oz.
 */
export function tam16DeOpciones(rows: ReadonlyArray<OpcionRecetaRow>): Tam16 | null {
  const r16 = rows.filter((r) => esOpcion16(r.optionName));
  if (!r16.length) return null;
  const t: Tam16 = { factor: {}, swap: {} };
  for (const r of r16) {
    if (r.reemplazaId && r.reemplazaId === r.ingredienteId) t.factor[r.ingredienteId] = r.qty;
    else if (r.reemplazaId) t.swap[r.reemplazaId] = r.ingredienteName;
  }
  const quita = r16.filter((r) => !r.reemplazaId && r.qty < 0);
  const pone = r16.filter((r) => !r.reemplazaId && r.qty > 0);
  if (quita.length === 1 && pone.length === 1 && !t.swap[quita[0].ingredienteId]) t.swap[quita[0].ingredienteId] = pone[0].ingredienteName;
  return t;
}

/** Ingredients a customer option swaps out (Deslactosada → the whole milk): «(sustituible)». */
export function sustituiblesDe(rows: ReadonlyArray<OpcionRecetaRow>): Set<string> {
  return new Set(rows.filter((r) => !esOpcion16(r.optionName) && r.reemplazaId && r.reemplazaId !== r.ingredienteId).map((r) => r.reemplazaId as string));
}
