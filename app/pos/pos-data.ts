// app/pos/pos-data.ts — POS menu, combos, modifier groups, and the scripted
// conversation that drives the AI assistant demo. Ported from the Claude Design
// prototype `comanda-pos-data.jsx`. This is the demo data layer: the scripted
// assistant references these exact ids (p2, p10, cb2 …), so it is intentionally
// self-contained rather than wired to live Supabase catalogo data.

/** Deterministic COP formatter (es-CO grouping, no decimals) — safe for SSR. */
export const posMoney = (n: number): string =>
  "$" + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");

export type CatId = "fav" | "hamb" | "acomp" | "beb" | "pos" | "salsa" | "combo";
export type StockStatus = "ok" | "bajo" | "sin";
export type ModGroupId = "punto" | "extras" | "quitar" | "salsas" | "tamano";

export interface PosCat {
  id: CatId;
  label: string;
}
export const POS_CATS: PosCat[] = [
  { id: "fav", label: "Favoritos" },
  { id: "hamb", label: "Hamburguesas" },
  { id: "acomp", label: "Acompañam." },
  { id: "beb", label: "Bebidas" },
  { id: "pos", label: "Postres" },
  { id: "salsa", label: "Salsas" },
  { id: "combo", label: "Combos" },
];

export interface MenuItem {
  id: string;
  name: string;
  cat: CatId;
  sub: string;
  sku: string;
  price: number;
  gluten: boolean;
  fav: boolean;
  stock: StockStatus;
  mods?: ModGroupId[];
  desc: string;
}

// Catalog grounded in the Productos module (demo subset).
export const POS_MENU: MenuItem[] = [
  { id: "p2", name: "Doble Tocineta", cat: "hamb", sub: "Especiales", sku: "HB-014", price: 32900, gluten: true, fav: true, stock: "ok", mods: ["punto", "extras", "quitar", "salsas"], desc: "Doble carne · tocineta · cheddar" },
  { id: "p1", name: "Clásica", cat: "hamb", sub: "Clásicas", sku: "HB-001", price: 24900, gluten: true, fav: true, stock: "ok", mods: ["punto", "extras", "quitar", "salsas"], desc: "Res 150g · lechuga · tomate" },
  { id: "p3", name: "Triple Bestia", cat: "hamb", sub: "Especiales", sku: "HB-022", price: 42900, gluten: true, fav: false, stock: "bajo", mods: ["punto", "extras", "quitar", "salsas"], desc: "Triple carne · 3 quesos" },
  { id: "p4", name: "Veggie Portobello", cat: "hamb", sub: "Vegetarianas", sku: "HB-031", price: 26900, gluten: false, fav: false, stock: "ok", mods: ["extras", "quitar", "salsas"], desc: "Portobello · apta sin gluten" },
  { id: "p5", name: "Papas Rústicas", cat: "acomp", sub: "Para picar", sku: "AC-002", price: 12900, gluten: false, fav: true, stock: "ok", mods: ["tamano"], desc: "Grandes · sin gluten" },
  { id: "p6", name: "Aros de cebolla", cat: "acomp", sub: "Para picar", sku: "AC-007", price: 11900, gluten: true, fav: false, stock: "sin", desc: "Empanizados" },
  { id: "p7", name: "Coca-Cola 400ml", cat: "beb", sub: "Gaseosas frías", sku: "BG-001", price: 5900, gluten: false, fav: true, stock: "ok", desc: "Botella" },
  { id: "p8", name: "Coca-Cola Zero", cat: "beb", sub: "Gaseosas frías", sku: "BG-002", price: 5900, gluten: false, fav: false, stock: "ok", desc: "Botella 400ml" },
  { id: "p9", name: "Cerveza Club", cat: "beb", sub: "Cervezas", sku: "BC-003", price: 8900, gluten: true, fav: false, stock: "ok", desc: "330ml · contiene gluten" },
  { id: "p10", name: "Limonada de coco", cat: "beb", sub: "Jugos naturales", sku: "BJ-005", price: 9900, gluten: false, fav: true, stock: "ok", desc: "Natural · la favorita" },
  { id: "p11", name: "Brownie con helado", cat: "pos", sub: "Postres", sku: "PO-002", price: 13900, gluten: true, fav: false, stock: "ok", desc: "Tibio · helado de vainilla" },
  { id: "p12", name: "Salsa BBQ casera", cat: "salsa", sub: "Salsas extra", sku: "SX-004", price: 2500, gluten: false, fav: false, stock: "ok", desc: "Porción extra" },
];

export const POS_BY_ID: Record<string, MenuItem> = Object.fromEntries(
  POS_MENU.map((p) => [p.id, p]),
);

export interface Combo {
  id: string;
  name: string;
  cat: "combo";
  items: string[];
  price: number;
  desc: string;
}
export const POS_COMBOS: Combo[] = [
  { id: "cb2", name: "Combo Doble", cat: "combo", items: ["p2", "p5", "p7"], price: 45900, desc: "Doble Tocineta + Papas + Gaseosa" },
  { id: "cb1", name: "Combo Clásico", cat: "combo", items: ["p1", "p5", "p7"], price: 38900, desc: "Clásica + Papas + Gaseosa" },
  { id: "cb3", name: "Combo Veggie", cat: "combo", items: ["p4", "p5", "p10"], price: 42900, desc: "Veggie + Papas + Limonada" },
];
export const POS_COMBO_BY_ID: Record<string, Combo> = Object.fromEntries(
  POS_COMBOS.map((c) => [c.id, c]),
);
export const comboSaving = (c: Combo | undefined): number =>
  c ? c.items.reduce((s, id) => s + (POS_BY_ID[id]?.price || 0), 0) - c.price : 0;

export interface ModOption {
  name: string;
  delta: number;
}
export interface ModGroup {
  id: ModGroupId;
  name: string;
  type: "single" | "multi";
  required: boolean;
  options: ModOption[];
}
// Modifier groups (mirror of the Modificadores back-office module).
export const POS_MOD_GROUPS: Record<ModGroupId, ModGroup> = {
  punto: { id: "punto", name: "Punto de la carne", type: "single", required: true, options: [{ name: "Término medio", delta: 0 }, { name: "Tres cuartos", delta: 0 }, { name: "Bien cocida", delta: 0 }, { name: "Inglesa", delta: 0 }] },
  extras: { id: "extras", name: "Extras", type: "multi", required: false, options: [{ name: "Queso cheddar extra", delta: 3500 }, { name: "Tocineta extra", delta: 4500 }, { name: "Huevo frito", delta: 2500 }, { name: "Aguacate", delta: 3000 }, { name: "Cebolla caramelizada", delta: 2000 }] },
  quitar: { id: "quitar", name: "Quitar ingredientes", type: "multi", required: false, options: [{ name: "Sin cebolla", delta: 0 }, { name: "Sin tomate", delta: 0 }, { name: "Sin pan (sin gluten)", delta: 0 }, { name: "Sin salsas", delta: 0 }] },
  salsas: { id: "salsas", name: "Salsas", type: "multi", required: false, options: [{ name: "BBQ casera", delta: 0 }, { name: "Mayo trufa", delta: 1500 }, { name: "Kétchup", delta: 0 }, { name: "Mostaza", delta: 0 }, { name: "Sriracha", delta: 1000 }] },
  tamano: { id: "tamano", name: "Tamaño", type: "single", required: false, options: [{ name: "Personal", delta: 0 }, { name: "Mediana", delta: 3500 }, { name: "Grande", delta: 6500 }] },
};

export type ModSelection = Record<string, string | string[] | null>;

/** Default selection per group for a fresh order line. */
export function posDefaultMods(product: MenuItem): ModSelection {
  const out: ModSelection = {};
  (product.mods || []).forEach((gid) => {
    const g = POS_MOD_GROUPS[gid];
    out[gid] = g.type === "single" ? (g.required || gid === "tamano" ? g.options[0].name : null) : [];
  });
  return out;
}

// ── Scripted conversation heard by the mic ──────────────────────
export type Kind =
  | "pedido" | "combo" | "upsell" | "modificador"
  | "agotado" | "alergia" | "atencion" | "fidelidad";

export type Act =
  | { type: "add"; id: string }
  | { type: "combo"; id: string }
  | { type: "swapCombo"; removeId: string; comboId: string }
  | { type: "mods"; id: string; set: Record<string, string | string[]> }
  | { type: "flag"; value?: string }
  | { type: "loyalty" };

export interface Suggest {
  kind: Kind;
  title: string;
  detail?: string;
  say?: string;
  actionLabel?: string;
  act?: Act;
}

export interface Beat {
  who: "cliente" | "cajero" | "sistema";
  time: string;
  text: string;
  delay?: number;
  focus?: { cat?: CatId; highlightId?: string | null };
  flag?: string;
  suggest?: Suggest;
}

export const POS_CONVERSATION: Beat[] = [
  { who: "cajero", time: "12:41", text: "¡Hola, bienvenido a Daniel’s Burger! ¿Qué le provoca hoy?", delay: 1500 },

  { who: "cliente", time: "12:41", text: "Hola, me regala una Doble Tocineta por favor.", delay: 2400,
    focus: { cat: "hamb", highlightId: "p2" },
    suggest: { kind: "pedido", title: "El cliente pidió una Doble Tocineta", detail: "Abrí Hamburguesas y la dejé lista. Confirma con un toque.", actionLabel: "Agregar Doble Tocineta · " + posMoney(32900), act: { type: "add", id: "p2" } } },

  { who: "cajero", time: "12:42", text: "¡Excelente elección, una de las favoritas!", delay: 1500 },

  { who: "cliente", time: "12:42", text: "Ah, que sea término medio, sin cebolla y con tocineta extra por favor.", delay: 2600,
    focus: { cat: "hamb", highlightId: "p2" },
    suggest: { kind: "modificador", title: "Personaliza la Doble Tocineta", detail: "Escuché: término medio · sin cebolla · + tocineta extra (" + posMoney(4500) + ").", say: "Claro: se la preparo término medio, sin cebolla y con tocineta extra. ¿Algo más?", actionLabel: "Aplicar al ítem", act: { type: "mods", id: "p2", set: { punto: "Término medio", quitar: ["Sin cebolla"], extras: ["Tocineta extra"] } } } },

  { who: "cajero", time: "12:43", text: "Listo: término medio, sin cebolla y con tocineta extra.", delay: 1700 },

  { who: "sistema", time: "12:43", text: "Oportunidad de combo detectada", delay: 1700,
    focus: { cat: "combo", highlightId: "cb2" },
    suggest: { kind: "combo", title: "Hazla Combo Doble y el cliente ahorra", detail: "Suma papas y gaseosa por " + posMoney(45900) + " — un ahorro de " + posMoney(comboSaving(POS_COMBO_BY_ID.cb2)) + ".", say: "¿Le provoca hacerla combo? Le sumo papas y una gaseosa, y le sale más a cuenta que por separado.", actionLabel: "Cambiar a Combo Doble", act: { type: "swapCombo", removeId: "p2", comboId: "cb2" } } },

  { who: "cliente", time: "12:43", text: "¿Y qué tienen para tomar? Algo bien frío.", delay: 2200,
    focus: { cat: "beb", highlightId: "p10" },
    suggest: { kind: "upsell", title: "Ofrece la bebida más pedida", detail: "Abrí Bebidas. La limonada de coco es la favorita de la casa.", say: "Le recomiendo la limonada de coco, es la más pedida. ¿Le provoca una?", actionLabel: "Agregar Limonada de coco · " + posMoney(9900), act: { type: "add", id: "p10" } } },

  { who: "cliente", time: "12:43", text: "Listo, deme la limonada de coco.", delay: 2300 },

  { who: "cliente", time: "12:44", text: "Ah, y unos aros de cebolla también.", delay: 2400,
    focus: { cat: "acomp", highlightId: "p5" },
    suggest: { kind: "agotado", title: "Aros de cebolla agotados hoy", detail: "Abrí Acompañamientos. Ofrece Papas Rústicas: sin gluten y las favoritas.", say: "Justo hoy se nos agotaron los aros. ¿Le ofrezco unas papas rústicas? Son las favoritas y quedan deliciosas.", actionLabel: "Sustituir por Papas Rústicas · " + posMoney(12900), act: { type: "add", id: "p5" } } },

  { who: "cliente", time: "12:45", text: "Una pregunta… ¿las papas tienen gluten? Es que soy celíaco.", delay: 2600, flag: "gluten",
    suggest: { kind: "alergia", title: "El cliente mencionó celiaquía (sin gluten)", detail: "Aptas: papas rústicas, Veggie, gaseosas, limonada. Con gluten: pan de hamburguesa, aros, cerveza, brownie.", say: "Tranquilo, lo anoto. Las papas rústicas son sin gluten. Le aviso si algo más lo lleva.", actionLabel: "Marcar pedido «Sin gluten»", act: { type: "flag", value: "Sin gluten" } } },

  { who: "cajero", time: "12:45", text: "¡Tranquilo! Las papas rústicas son sin gluten. Lo dejo anotado.", delay: 2000 },

  { who: "cliente", time: "12:46", text: "Perfecto. ¿Y algo de postre tienen?", delay: 2400,
    focus: { cat: "pos", highlightId: null },
    suggest: { kind: "atencion", title: "Cuidado: el brownie lleva gluten", detail: "El cliente es celíaco. No ofrezcas el brownie. Mejor: helado solo o copa de fruta.", say: "De postre le recomiendo el helado solito o una copa de fruta — son sin gluten y perfectos para usted." } },

  { who: "sistema", time: "12:47", text: "Cliente frecuente reconocido", delay: 1900,
    suggest: { kind: "fidelidad", title: "¡Está a 1 sello del postre gratis!", detail: "Lleva 9 de 10 sellos. Invítalo a registrar esta compra y se gana el postre.", say: "Con esta compra completa sus sellos y se gana un postre gratis. ¿Quiere que lo registre?", actionLabel: "Registrar sello de fidelidad", act: { type: "loyalty" } } },
];

export const POS_KIND_LABEL: Record<Kind, string> = {
  pedido: "Pedido", combo: "Combo", upsell: "Sugerencia", modificador: "Personaliza",
  agotado: "Agotado", alergia: "Alergia", atencion: "Atención", fidelidad: "Fidelidad",
};
