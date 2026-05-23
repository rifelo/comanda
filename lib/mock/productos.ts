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
  { id: "catalogo", n: "01", label: "Productos · catálogo", href: "/productos/catalogo" },
  { id: "ingredientes", n: "02", label: "Ingredientes", href: "/productos/ingredientes" },
  { id: "recetas", n: "03", label: "Recetas", href: "/productos/recetas" },
  { id: "stock", n: "04", label: "Control de stock", href: "/productos/stock" },
  { id: "historial", n: "05", label: "Movimientos", href: "/productos/historial" },
  { id: "notificaciones", n: "06", label: "Notificaciones", href: "/productos/notificaciones" },
  { id: "conteo", n: "07", label: "Conteo de inventario", href: "/productos/conteo" },
  { id: "precios", n: "08", label: "Listas de precios", href: "/productos/precios" },
  { id: "importacion", n: "09", label: "Importación", href: "/productos/importacion" },
  { id: "modificadores", n: "10", label: "Modificadores", href: "/productos/modificadores" },
  { id: "combos", n: "11", label: "Combos · vinculaciones", href: "/productos/combos" },
] as const;

// ─────────────────────────────────────────────────────────────
// 01 · Catálogo
// ─────────────────────────────────────────────────────────────
export type StockStatus = "ok" | "bajo" | "sin";

export type CategoriaRow = {
  id: string;
  label: string;
  count: number;
  indent?: number;
  root?: boolean;
  expanded?: boolean;
  children?: CategoriaRow[];
};

export const CATEGORIAS: CategoriaRow[] = [
  { id: "all", label: "Todas las categorías", count: 86, root: true },
  {
    id: "hamb",
    label: "Hamburguesas",
    count: 18,
    indent: 0,
    expanded: true,
    children: [
      { id: "hamb-clas", label: "Clásicas", count: 8, indent: 1 },
      { id: "hamb-esp", label: "Especiales", count: 7, indent: 1 },
      { id: "hamb-veg", label: "Vegetarianas", count: 3, indent: 1 },
    ],
  },
  { id: "acomp", label: "Acompañamientos", count: 12, indent: 0 },
  {
    id: "beb",
    label: "Bebidas",
    count: 22,
    indent: 0,
    expanded: true,
    children: [
      { id: "beb-gas", label: "Gaseosas", count: 9, indent: 1 },
      { id: "beb-cer", label: "Cervezas", count: 6, indent: 1 },
      { id: "beb-jugo", label: "Jugos naturales", count: 7, indent: 1 },
    ],
  },
  { id: "pos", label: "Postres", count: 7, indent: 0 },
  { id: "salsas", label: "Salsas (extras)", count: 9, indent: 0 },
  { id: "combos", label: "Combos", count: 18, indent: 0 },
];

export type Producto = {
  id: string;
  name: string;
  cat: string;
  sku: string;
  price: number;
  cost: number;
  margin: number;
  stock: StockStatus;
  fav: boolean;
};

export const PRODUCTOS: Producto[] = [
  { id: "p1", name: "Daniel's Burger Clásica", cat: "Hamburguesas · Clásicas", sku: "HB-001", price: 24900, cost: 9200, margin: 63, stock: "ok", fav: true },
  { id: "p2", name: "Doble Tocineta", cat: "Hamburguesas · Especiales", sku: "HB-014", price: 32900, cost: 13800, margin: 58, stock: "ok", fav: true },
  { id: "p3", name: "Triple Bestia", cat: "Hamburguesas · Especiales", sku: "HB-022", price: 42900, cost: 19400, margin: 55, stock: "bajo", fav: true },
  { id: "p4", name: "Veggie Portobello", cat: "Hamburguesas · Vegetarianas", sku: "HB-031", price: 26900, cost: 10100, margin: 62, stock: "ok", fav: false },
  { id: "p5", name: "Papas Rústicas grandes", cat: "Acompañamientos", sku: "AC-002", price: 12900, cost: 3400, margin: 73, stock: "ok", fav: false },
  { id: "p6", name: "Aros de cebolla", cat: "Acompañamientos", sku: "AC-007", price: 11900, cost: 3800, margin: 68, stock: "sin", fav: false },
  { id: "p7", name: "Coca-Cola 400ml", cat: "Bebidas · Gaseosas", sku: "BG-001", price: 5900, cost: 2100, margin: 64, stock: "ok", fav: true },
  { id: "p8", name: "Coca-Cola Zero 400ml", cat: "Bebidas · Gaseosas", sku: "BG-002", price: 5900, cost: 2100, margin: 64, stock: "bajo", fav: false },
  { id: "p9", name: "Cerveza Club Colombia", cat: "Bebidas · Cervezas", sku: "BC-003", price: 8900, cost: 3600, margin: 60, stock: "ok", fav: false },
  { id: "p10", name: "Limonada de coco", cat: "Bebidas · Jugos naturales", sku: "BJ-005", price: 9900, cost: 2900, margin: 71, stock: "ok", fav: true },
  { id: "p11", name: "Brownie con helado", cat: "Postres", sku: "PO-002", price: 13900, cost: 4100, margin: 71, stock: "ok", fav: false },
  { id: "p12", name: "Salsa BBQ casera", cat: "Salsas (extras)", sku: "SX-004", price: 2500, cost: 600, margin: 76, stock: "bajo", fav: false },
];

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

export type Receta = {
  product: string;
  sku: string;
  cat: string;
  price: number;
  ings: RecetaIngrediente[];
};

export const RECETA: Receta = {
  product: "Doble Tocineta",
  sku: "HB-014",
  cat: "Hamburguesas · Especiales",
  price: 32900,
  ings: [
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
