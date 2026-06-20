/**
 * Mock data for the Productos admin module.
 *
 * UI-only — no database. Values mirror the design handoff (Daniel's · Norte
 * context, COP prices, español LATAM). Keep this file the single source of
 * truth for the module's mock arrays so individual sections don't drift.
 */

// ─────────────────────────────────────────────────────────────
// Sections (sub-nav order shown in ProductosShell)
// ─────────────────────────────────────────────────────────────
export type ProductosSection = {
  id: string;
  n: string;
  label: string;
  href: string;
};

export const PROD_SECTIONS: readonly ProductosSection[] = [
  { id: "catalogo", n: "01", label: "Productos", href: "/catalogo" },
  { id: "inventario", n: "02", label: "Inventario", href: "/inventario" },
  { id: "recetas", n: "03", label: "Recetas", href: "/recetas" },
  { id: "historial", n: "04", label: "Movimientos", href: "/historial" },
  { id: "notificaciones", n: "05", label: "Notificaciones", href: "/notificaciones" },
  { id: "precios", n: "06", label: "Listas de precios", href: "/precios" },
  { id: "importacion", n: "07", label: "Importación", href: "/importacion" },
  { id: "modificadores", n: "08", label: "Modificadores", href: "/modificadores" },
  { id: "combos", n: "09", label: "Combos", href: "/combos" },
  { id: "pos", n: "10", label: "Punto de venta", href: "/pos" },
] as const;

// ─────────────────────────────────────────────────────────────
// 01 · Catálogo — types/data now live in the database; see
// `lib/db/productos.ts` and `lib/types.ts`. `StockStatus` and `fmtCOP`
// stay because shared visual primitives in `_components/shared.tsx`
// (StockBadge) and the other 10 sections' clients still import them.
// ─────────────────────────────────────────────────────────────
export type StockStatus = "ok" | "bajo" | "sin";

// ─────────────────────────────────────────────────────────────
// 02 · Ingredientes
// ─────────────────────────────────────────────────────────────
export type IngredienteTreeRow = {
  id: string;
  label: string;
  count?: number;
  indent?: number;
  root?: boolean;
  leaf?: boolean;
  expanded?: boolean;
  children?: IngredienteTreeRow[];
};

export const ING_TREE: IngredienteTreeRow[] = [
  { id: "all", label: "Todos los ingredientes", count: 142, root: true },
  {
    id: "carn",
    label: "Cárnicos",
    count: 18,
    indent: 0,
    expanded: true,
    children: [
      {
        id: "carn-res",
        label: "Res",
        count: 6,
        indent: 1,
        expanded: true,
        children: [
          { id: "carn-res-mol", label: "· Carne molida 80/20", indent: 2, leaf: true },
          { id: "carn-res-tro", label: "· Trozo costilla", indent: 2, leaf: true },
        ],
      },
      { id: "carn-cer", label: "Cerdo", count: 5, indent: 1 },
      { id: "carn-poll", label: "Pollo", count: 7, indent: 1 },
    ],
  },
  { id: "pan", label: "Panes y harinas", count: 14, indent: 0 },
  { id: "lact", label: "Lácteos", count: 11, indent: 0 },
  { id: "veg", label: "Vegetales", count: 23, indent: 0 },
  { id: "sals", label: "Salsas e insumos", count: 21, indent: 0 },
  { id: "fritura", label: "Aceites · fritura", count: 4, indent: 0 },
  { id: "desech", label: "Desechables · empaque", count: 17, indent: 0 },
];

export type Ingrediente = {
  name: string;
  group: string;
  unit: string;
  stock: number;
  min: number;
  merma: number;
  cost: number;
  sub?: string[];
};

export const INGS: Ingrediente[] = [
  { name: "Carne molida 80/20", group: "Cárnicos · Res", unit: "kg", stock: 14.2, min: 8, merma: 3.2, cost: 18900 },
  { name: 'Pan brioche 4"', group: "Panes y harinas", unit: "und", stock: 240, min: 100, merma: 0.5, cost: 1100, sub: ["Pan brioche · clásico", "Pan brioche · ajonjolí"] },
  { name: "Queso cheddar lonchas", group: "Lácteos", unit: "kg", stock: 3.1, min: 4, merma: 1.1, cost: 24500 },
  { name: "Tocineta ahumada", group: "Cárnicos · Cerdo", unit: "kg", stock: 6.4, min: 5, merma: 4.0, cost: 22800 },
  { name: "Lechuga crespa", group: "Vegetales", unit: "und", stock: 22, min: 12, merma: 8.5, cost: 3200 },
  { name: "Tomate chonto", group: "Vegetales", unit: "kg", stock: 4.8, min: 5, merma: 6.0, cost: 4200 },
  { name: "Salsa BBQ base", group: "Salsas e insumos", unit: "L", stock: 9, min: 6, merma: 0.2, cost: 8400 },
  { name: "Aceite de fritura", group: "Aceites · fritura", unit: "L", stock: 18, min: 20, merma: 1.4, cost: 9800 },
  { name: "Caja hamburguesa", group: "Desechables · empaque", unit: "und", stock: 480, min: 200, merma: 0, cost: 380 },
];

// ─────────────────────────────────────────────────────────────
// 03 · Recetas
// ─────────────────────────────────────────────────────────────
export type RecetaIngrediente = {
  name: string;
  qty: number;
  unit: string;
  cost: number;
  total: number;
  note?: string;
};

export type RecetaSummary = {
  id: string;
  product: string;
  sku: string;
  cat: string;
  price: number;
  version: number;
  editor: string;
  date: string;
};

export const RECETAS_LIST: RecetaSummary[] = [
  { id: "r1", product: "Daniel's Burger Clásica", sku: "HB-001", cat: "Hamburguesas · Clásicas", price: 24900, version: 4, editor: "Andrés R.", date: "20·MAY" },
  { id: "r2", product: "Doble Tocineta", sku: "HB-014", cat: "Hamburguesas · Especiales", price: 32900, version: 3, editor: "Andrés R.", date: "14·MAY" },
  { id: "r3", product: "Triple Bestia", sku: "HB-022", cat: "Hamburguesas · Especiales", price: 42900, version: 2, editor: "Carlos M.", date: "10·MAY" },
  { id: "r4", product: "Veggie Portobello", sku: "HB-031", cat: "Hamburguesas · Vegetarianas", price: 26900, version: 1, editor: "Andrés R.", date: "05·MAY" },
  { id: "r5", product: "Papas Rústicas grandes", sku: "AC-002", cat: "Acompañamientos", price: 12900, version: 2, editor: "Carlos M.", date: "02·MAY" },
  { id: "r6", product: "Limonada de coco", sku: "BJ-005", cat: "Bebidas · Jugos naturales", price: 9900, version: 3, editor: "Andrés R.", date: "18·MAY" },
  { id: "r7", product: "Brownie con helado", sku: "PO-002", cat: "Postres", price: 13900, version: 1, editor: "Laura V.", date: "08·MAY" },
];

export const RECETAS_INGS: Record<string, RecetaIngrediente[]> = {
  r1: [
    { name: 'Pan brioche 4"', qty: 1, unit: "und", cost: 1100, total: 1100 },
    { name: "Carne molida 80/20", qty: 0.15, unit: "kg", cost: 18900, total: 2835 },
    { name: "Queso cheddar", qty: 1, unit: "loncha", cost: 980, total: 980 },
    { name: "Lechuga crespa", qty: 0.5, unit: "und", cost: 3200, total: 1600 },
    { name: "Tomate chonto", qty: 0.04, unit: "kg", cost: 4200, total: 168 },
    { name: "Salsa BBQ casera", qty: 20, unit: "g", cost: 22, total: 440 },
    { name: "Caja hamburguesa", qty: 1, unit: "und", cost: 380, total: 380 },
  ],
  r2: [
    { name: 'Pan brioche 4"', qty: 1, unit: "und", cost: 1100, total: 1100 },
    { name: "Carne molida 80/20", qty: 0.18, unit: "kg", cost: 18900, total: 3402 },
    { name: "Carne molida 80/20", qty: 0.18, unit: "kg", cost: 18900, total: 3402, note: "segunda carne" },
    { name: "Queso cheddar", qty: 2, unit: "lonchas", cost: 980, total: 1960 },
    { name: "Tocineta ahumada", qty: 0.06, unit: "kg", cost: 22800, total: 1368 },
    { name: "Lechuga crespa", qty: 0.5, unit: "und", cost: 3200, total: 1600 },
    { name: "Tomate chonto", qty: 0.06, unit: "kg", cost: 4200, total: 252 },
    { name: "Salsa BBQ casera", qty: 30, unit: "g", cost: 22, total: 660 },
    { name: "Caja hamburguesa", qty: 1, unit: "und", cost: 380, total: 380 },
  ],
  r3: [
    { name: 'Pan brioche 4"', qty: 1, unit: "und", cost: 1100, total: 1100 },
    { name: "Carne molida 80/20", qty: 0.24, unit: "kg", cost: 18900, total: 4536 },
    { name: "Carne molida 80/20", qty: 0.24, unit: "kg", cost: 18900, total: 4536, note: "segunda carne" },
    { name: "Carne molida 80/20", qty: 0.24, unit: "kg", cost: 18900, total: 4536, note: "tercera carne" },
    { name: "Queso cheddar", qty: 3, unit: "lonchas", cost: 980, total: 2940 },
    { name: "Tocineta ahumada", qty: 0.08, unit: "kg", cost: 22800, total: 1824 },
    { name: "Caja hamburguesa", qty: 1, unit: "und", cost: 380, total: 380 },
  ],
  r4: [
    { name: 'Pan brioche 4"', qty: 1, unit: "und", cost: 1100, total: 1100 },
    { name: "Portobello fresco", qty: 0.12, unit: "kg", cost: 12000, total: 1440 },
    { name: "Queso mozzarella", qty: 0.06, unit: "kg", cost: 18500, total: 1110 },
    { name: "Lechuga crespa", qty: 1, unit: "und", cost: 3200, total: 3200 },
    { name: "Tomate chonto", qty: 0.08, unit: "kg", cost: 4200, total: 336 },
    { name: "Caja hamburguesa", qty: 1, unit: "und", cost: 380, total: 380 },
  ],
  r5: [
    { name: "Papa R12 lavada", qty: 0.3, unit: "kg", cost: 2800, total: 840 },
    { name: "Aceite de fritura", qty: 0.04, unit: "L", cost: 9800, total: 392 },
    { name: "Sal marina", qty: 3, unit: "g", cost: 8, total: 24 },
    { name: "Caja papas", qty: 1, unit: "und", cost: 220, total: 220 },
  ],
  r6: [
    { name: "Coco rallado", qty: 0.04, unit: "kg", cost: 8200, total: 328 },
    { name: "Limón Tahití", qty: 3, unit: "und", cost: 320, total: 960 },
    { name: "Azúcar", qty: 0.03, unit: "kg", cost: 1800, total: 54 },
    { name: "Agua", qty: 0.3, unit: "L", cost: 100, total: 30 },
    { name: "Vaso plástico 16oz", qty: 1, unit: "und", cost: 280, total: 280 },
  ],
  r7: [
    { name: "Brownie base", qty: 1, unit: "porción", cost: 1800, total: 1800 },
    { name: "Helado vainilla", qty: 2, unit: "bolas", cost: 600, total: 1200 },
    { name: "Salsa chocolate", qty: 20, unit: "g", cost: 18, total: 360 },
    { name: "Plato desechable", qty: 1, unit: "und", cost: 150, total: 150 },
  ],
};

// ─────────────────────────────────────────────────────────────
// 04 · Control de stock
// ─────────────────────────────────────────────────────────────
export type StockItem = {
  name: string;
  cat: string;
  current: number;
  min: number;
  unit: string;
  updated: string;
};

export const STOCK_ITEMS: Record<"productos" | "ingredientes", StockItem[]> = {
  productos: [
    { name: "Daniel's Burger Clásica", cat: "Hamburguesas", current: 38, min: 12, unit: "und", updated: "hoy 11:22" },
    { name: "Doble Tocineta", cat: "Hamburguesas", current: 22, min: 10, unit: "und", updated: "hoy 12:14" },
    { name: "Triple Bestia", cat: "Hamburguesas", current: 3, min: 8, unit: "und", updated: "hoy 11:50" },
    { name: "Papas Rústicas grandes", cat: "Acompañamientos", current: 64, min: 20, unit: "und", updated: "hoy 09:30" },
    { name: "Aros de cebolla", cat: "Acompañamientos", current: 0, min: 18, unit: "und", updated: "ayer 22:08" },
    { name: "Coca-Cola 400ml", cat: "Bebidas", current: 86, min: 30, unit: "und", updated: "hoy 10:55" },
    { name: "Coca-Cola Zero 400ml", cat: "Bebidas", current: 9, min: 18, unit: "und", updated: "hoy 10:55" },
  ],
  ingredientes: [
    { name: "Carne molida 80/20", cat: "Cárnicos · Res", current: 14.2, min: 8, unit: "kg", updated: "hoy 11:00" },
    { name: 'Pan brioche 4"', cat: "Panes", current: 240, min: 100, unit: "und", updated: "hoy 09:08" },
    { name: "Queso cheddar", cat: "Lácteos", current: 3.1, min: 4, unit: "kg", updated: "hoy 08:40" },
    { name: "Tocineta ahumada", cat: "Cárnicos · Cerdo", current: 6.4, min: 5, unit: "kg", updated: "hoy 08:40" },
    { name: "Aceite de fritura", cat: "Aceites", current: 18, min: 20, unit: "L", updated: "ayer 21:12" },
  ],
};

// ─────────────────────────────────────────────────────────────
// 05 · Movimientos
// ─────────────────────────────────────────────────────────────
export type MovTipo = "venta" | "gasto" | "ajuste" | "import";

export type Movimiento = {
  date: string;
  item: string;
  tipo: MovTipo;
  delta: number;
  user: string;
  bal: number;
  note?: string;
};

export const MOVS: Movimiento[] = [
  { date: "15·MAY 12:34", item: "Doble Tocineta", tipo: "venta", delta: -1, user: "POS · Caja 1", bal: 21 },
  { date: "15·MAY 12:30", item: "Coca-Cola Zero 400ml", tipo: "venta", delta: -2, user: "POS · Caja 1", bal: 9 },
  { date: "15·MAY 11:50", item: "Triple Bestia", tipo: "ajuste", delta: -2, user: "Mariana C.", bal: 3, note: "producto dañado · merma" },
  { date: "15·MAY 11:22", item: "Daniel's Burger Clásica", tipo: "venta", delta: -3, user: "POS · Caja 2", bal: 38 },
  { date: "15·MAY 10:08", item: "Carne molida 80/20", tipo: "gasto", delta: -2.4, user: "Cocina", bal: 14.2, note: "producción mañana" },
  { date: '15·MAY 09:08', item: 'Pan brioche 4"', tipo: "import", delta: 240, user: "Andrés R.", bal: 240, note: "recepción proveedor #4082" },
  { date: "15·MAY 08:40", item: "Queso cheddar", tipo: "import", delta: 6, user: "Andrés R.", bal: 3.1, note: "recepción proveedor #4082" },
  { date: "14·MAY 22:08", item: "Aros de cebolla", tipo: "venta", delta: -2, user: "POS · Caja 1", bal: 0 },
  { date: "14·MAY 18:20", item: "Salsa BBQ casera", tipo: "ajuste", delta: -0.5, user: "Luis A.", bal: 8.6, note: "derrame en barra" },
  { date: "14·MAY 14:30", item: "Aceite de fritura", tipo: "gasto", delta: -1, user: "Cocina", bal: 19 },
];

// ─────────────────────────────────────────────────────────────
// 06 · Notificaciones
// ─────────────────────────────────────────────────────────────
export type NotifItem = {
  name: string;
  cat: string;
  alert: boolean;
  min: number;
  lock: boolean;
};

export const NOTIF_ITEMS: NotifItem[] = [
  { name: "Daniel's Burger Clásica", cat: "Producto · Hamburguesas", alert: true, min: 12, lock: false },
  { name: "Doble Tocineta", cat: "Producto · Hamburguesas", alert: true, min: 10, lock: false },
  { name: "Triple Bestia", cat: "Producto · Hamburguesas", alert: true, min: 8, lock: true },
  { name: "Aros de cebolla", cat: "Producto · Acompañamientos", alert: true, min: 18, lock: true },
  { name: "Coca-Cola Zero 400ml", cat: "Producto · Bebidas", alert: true, min: 18, lock: false },
  { name: "Carne molida 80/20", cat: "Ingrediente · Cárnicos", alert: true, min: 8, lock: false },
  { name: 'Pan brioche 4"', cat: "Ingrediente · Panes", alert: true, min: 100, lock: false },
  { name: "Queso cheddar", cat: "Ingrediente · Lácteos", alert: false, min: 4, lock: false },
  { name: "Aceite de fritura", cat: "Ingrediente · Aceites", alert: true, min: 20, lock: false },
];

// ─────────────────────────────────────────────────────────────
// 07 · Conteo de inventario
// ─────────────────────────────────────────────────────────────
export type ConteoItem = {
  name: string;
  unit: string;
  sys: number;
  fisico: number | null;
};

export const CONTEO_ITEMS: ConteoItem[] = [
  { name: 'Pan brioche 4"', unit: "und", sys: 240, fisico: 236 },
  { name: "Carne molida 80/20", unit: "kg", sys: 14.2, fisico: 13.8 },
  { name: "Queso cheddar", unit: "kg", sys: 3.1, fisico: 3.3 },
  { name: "Tocineta ahumada", unit: "kg", sys: 6.4, fisico: 6.4 },
  { name: "Lechuga crespa", unit: "und", sys: 22, fisico: 20 },
  { name: "Tomate chonto", unit: "kg", sys: 4.8, fisico: 4.6 },
  { name: "Salsa BBQ casera", unit: "L", sys: 8.6, fisico: null },
  { name: "Aceite de fritura", unit: "L", sys: 18, fisico: 17 },
  { name: "Caja hamburguesa", unit: "und", sys: 480, fisico: 472 },
];

// ─────────────────────────────────────────────────────────────
// 08 · Listas de precios
// ─────────────────────────────────────────────────────────────
export type PriceList = { id: string; name: string; sub: string };

export const PRICE_LISTS: PriceList[] = [
  { id: "base", name: "Lista base", sub: "En sede · regular" },
  { id: "del", name: "Delivery", sub: "Rappi · DiDi Food · Domicilios" },
  { id: "happy", name: "Happy Hour", sub: "Mar–Jue · 17–19h" },
  { id: "corp", name: "Corporativo", sub: "Convenios empresariales" },
];

export type PriceProduct = {
  name: string;
  cat: string;
  precios: (number | null)[];
};

export const PRICE_PRODUCTS: PriceProduct[] = [
  { name: "Daniel's Burger Clásica", cat: "Hamburguesas", precios: [24900, 28900, 19900, 22900] },
  { name: "Doble Tocineta", cat: "Hamburguesas", precios: [32900, 37900, 27900, 30900] },
  { name: "Triple Bestia", cat: "Hamburguesas", precios: [42900, 47900, null, 39900] },
  { name: "Veggie Portobello", cat: "Hamburguesas", precios: [26900, 30900, 21900, 24900] },
  { name: "Papas Rústicas grandes", cat: "Acompañ.", precios: [12900, 14900, 9900, 11900] },
  { name: "Aros de cebolla", cat: "Acompañ.", precios: [11900, 13900, 8900, 10900] },
  { name: "Coca-Cola 400ml", cat: "Bebidas", precios: [5900, 7500, 4500, 5500] },
  { name: "Cerveza Club Colombia", cat: "Bebidas", precios: [8900, 10500, null, 8500] },
  { name: "Brownie con helado", cat: "Postres", precios: [13900, 15900, 9900, 12900] },
];

// ─────────────────────────────────────────────────────────────
// 09 · Importación
// ─────────────────────────────────────────────────────────────
export type ParsedRow = {
  sku: string;
  name: string;
  cat: string;
  price: number;
  cost: number | null;
  stock: number;
  ok: boolean;
  err?: string;
};

export const PARSED_ROWS: ParsedRow[] = [
  { sku: "HB-041", name: "Burger Trufa Negra", cat: "Hamburguesas · Especiales", price: 38900, cost: 14200, stock: 25, ok: true },
  { sku: "HB-042", name: "Smash Cheddar", cat: "Hamburguesas · Clásicas", price: 22900, cost: 8400, stock: 30, ok: true },
  { sku: "AC-018", name: "Yuca frita", cat: "Acompañamientos", price: 9900, cost: 2400, stock: 40, ok: true },
  { sku: "", name: "Limonada cerezada", cat: "Bebidas · Jugos", price: 9900, cost: null, stock: 20, ok: false, err: "SKU vacío · costo inválido" },
  { sku: "PO-005", name: "Cheesecake fresa", cat: "Postres", price: 14900, cost: 4500, stock: 12, ok: true },
  { sku: "HB-001", name: "Daniel's Burger Clásica", cat: "Hamburguesas · Clásicas", price: 24900, cost: 9200, stock: 50, ok: false, err: "SKU duplicado · ya existe" },
  { sku: "BG-008", name: "Sprite 400ml", cat: "Bebidas · Gaseosas", price: 5900, cost: 2100, stock: 60, ok: true },
];

// ─────────────────────────────────────────────────────────────
// 10 · Modificadores
// ─────────────────────────────────────────────────────────────
export type ModifOption = { name: string; delta: number; on: boolean };

export type ModifGroup = {
  name: string;
  type: "single" | "multiple";
  required: boolean;
  linked: number;
  expanded?: boolean;
  options: ModifOption[];
};

export const MODIF_GROUPS: ModifGroup[] = [
  {
    name: "Punto de la carne",
    type: "single",
    required: true,
    linked: 12,
    options: [
      { name: "Término medio", delta: 0, on: true },
      { name: "Tres cuartos", delta: 0, on: true },
      { name: "Bien cocida", delta: 0, on: true },
      { name: "Inglesa", delta: 0, on: false },
    ],
  },
  {
    name: "Tamaño de papas",
    type: "single",
    required: false,
    linked: 8,
    expanded: true,
    options: [
      { name: "Personal", delta: 0, on: true },
      { name: "Mediana", delta: 3500, on: true },
      { name: "Grande", delta: 6500, on: true },
    ],
  },
  {
    name: "Extras (multi)",
    type: "multiple",
    required: false,
    linked: 18,
    expanded: true,
    options: [
      { name: "Queso cheddar extra", delta: 3500, on: true },
      { name: "Tocineta extra", delta: 4500, on: true },
      { name: "Huevo frito", delta: 2500, on: true },
      { name: "Aguacate", delta: 3000, on: false },
      { name: "Cebolla caramelizada", delta: 2000, on: true },
    ],
  },
  {
    name: "Salsas (multi)",
    type: "multiple",
    required: false,
    linked: 24,
    options: [
      { name: "BBQ casera", delta: 0, on: true },
      { name: "Mayo trufa", delta: 1500, on: true },
      { name: "Kétchup", delta: 0, on: true },
      { name: "Mostaza", delta: 0, on: true },
      { name: "Sriracha", delta: 1000, on: true },
    ],
  },
];

// ─────────────────────────────────────────────────────────────
// 11 · Combos
// ─────────────────────────────────────────────────────────────
export type ComboLinked = { name: string; qty: number; price: number };

export type Combo = {
  id: string;
  name: string;
  sub: string;
  main: { name: string; price: number };
  linked: ComboLinked[];
  comboPrice: number;
  saving: number;
  active: boolean;
};

export const COMBOS: Combo[] = [
  {
    id: "c1",
    name: "Combo Clásico",
    sub: "la combinación más pedida",
    main: { name: "Daniel's Burger Clásica", price: 24900 },
    linked: [
      { name: "Papas Rústicas medianas", qty: 1, price: 8900 },
      { name: "Coca-Cola 400ml", qty: 1, price: 5900 },
    ],
    comboPrice: 33900,
    saving: 5800,
    active: true,
  },
  {
    id: "c2",
    name: "Combo Doble Hambre",
    sub: "sábados y domingos",
    main: { name: "Doble Tocineta", price: 32900 },
    linked: [
      { name: "Papas Rústicas grandes", qty: 1, price: 12900 },
      { name: "Aros de cebolla", qty: 1, price: 11900 },
      { name: "Cerveza Club Colombia", qty: 1, price: 8900 },
    ],
    comboPrice: 52900,
    saving: 13700,
    active: true,
  },
  {
    id: "c3",
    name: "Combo Veggie",
    sub: "lanzamiento mayo",
    main: { name: "Veggie Portobello", price: 26900 },
    linked: [
      { name: "Papas Rústicas medianas", qty: 1, price: 8900 },
      { name: "Limonada de coco", qty: 1, price: 9900 },
    ],
    comboPrice: 36900,
    saving: 8800,
    active: false,
  },
];

// ─────────────────────────────────────────────────────────────
// COP formatter
// ─────────────────────────────────────────────────────────────
export const fmtCOP = (n: number) => n.toLocaleString("es-CO");
