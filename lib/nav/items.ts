/**
 * Navigation model for both faces of the app (docs/redesign/PLAN.md §2).
 *
 * Plain data only — items cross the server→client boundary as props, so
 * icons are names (resolved by components/ui/icon.tsx) and "active" is
 * decided by path prefixes (lib/nav/active.ts), never by functions.
 *
 * Hrefs point at routes that exist TODAY. Old routes keep working after
 * P3/P4 rename them (each becomes a redirect), and `match` already lists the
 * new prefixes, so the tabs light up correctly before and after.
 * TODO(Ola 3): swap hrefs to the new routes (/productos, /equipo, /ajustes,
 * /clientes, /inventario/movimientos, /inventario/pedidos…).
 */

export type IconName =
  | "hoy"
  | "tareas"
  | "caja"
  | "inventario"
  | "pos"
  | "productos"
  | "equipo"
  | "mas"
  | "gastos"
  | "clientes"
  | "ajustes"
  | "turno"
  | "menu"
  | "instalar"
  | "avanzado"
  | "salir";

export type NavSection = { href: string; label: string; match?: string[] };

export type NavItem = {
  id: string;
  href: string;
  label: string;
  icon: IconName;
  /** Path prefixes that make this item active (defaults to `[href]`). */
  match?: string[];
  /** Exact-path matches (e.g. "/turno" must not claim "/turno/caja"). */
  exact?: string[];
  /** Sub-pages shown as a strip (phone/tablet) or nested in the rail. */
  sections?: NavSection[];
  /** Badge count (late tasks, pending orders); filled at runtime. */
  badge?: number;
  /** Open in a new tab (public menu). */
  external?: boolean;
  sub?: string;
};

// ── Cara Equipo (tablet compartida + teléfono del barista) ──────────
export const EQUIPO_TABS: NavItem[] = [
  { id: "hoy", href: "/turno", label: "Hoy", icon: "hoy", exact: ["/turno"] },
  { id: "tareas", href: "/turno/tareas", label: "Tareas", icon: "tareas", match: ["/turno/tareas"] },
  { id: "caja", href: "/turno/caja", label: "Caja", icon: "caja", match: ["/turno/caja"] },
  {
    id: "inventario",
    href: "/turno/inventario",
    label: "Inventario",
    icon: "inventario",
    match: ["/turno/inventario", "/turno/conteo"],
  },
  { id: "pos", href: "/pos", label: "POS", icon: "pos", match: ["/pos"] },
];

// ── Cara Dueño ─────────────────────────────────────────────────────
export const DUENO_TABS: NavItem[] = [
  {
    id: "hoy",
    href: "/hoy",
    label: "Hoy",
    icon: "hoy",
    match: ["/hoy", "/numeros", "/dashboard", "/shifts"],
    sections: [
      { href: "/hoy", label: "Operación", match: [] },
      { href: "/numeros", label: "Números", match: ["/numeros"] },
    ],
  },
  {
    id: "inventario",
    href: "/inventario",
    label: "Inventario",
    icon: "inventario",
    match: ["/inventario", "/historial", "/compras"],
    sections: [
      { href: "/inventario", label: "Existencias", match: [] },
      { href: "/historial", label: "Movimientos", match: ["/historial", "/inventario/movimientos", "/inventario/kardex"] },
      { href: "/compras", label: "Pedidos", match: ["/compras", "/inventario/pedidos"] },
      { href: "/inventario/faltantes", label: "Faltantes", match: ["/inventario/faltantes"] },
      { href: "/inventario/conteos", label: "Conteos", match: ["/inventario/conteos"] },
      { href: "/inventario/mermas", label: "Mermas", match: ["/inventario/mermas"] },
      { href: "/inventario/niveles", label: "Niveles", match: ["/inventario/niveles"] },
      { href: "/inventario/sugerencias", label: "Sugerencias", match: ["/inventario/sugerencias"] },
    ],
  },
  {
    id: "productos",
    href: "/catalogo",
    label: "Productos",
    icon: "productos",
    match: ["/productos", "/catalogo", "/recetas", "/modificadores"],
    sections: [
      { href: "/catalogo", label: "Productos", match: ["/catalogo", "/productos"] },
      { href: "/recetas", label: "Recetas", match: ["/recetas"] },
      { href: "/modificadores", label: "Modificadores", match: ["/modificadores"] },
    ],
  },
  {
    id: "equipo",
    href: "/configuracion/equipo",
    label: "Equipo",
    icon: "equipo",
    match: ["/equipo", "/configuracion/equipo", "/turnos"],
    sections: [
      { href: "/configuracion/equipo", label: "Personas", match: ["/configuracion/equipo"] },
      { href: "/turnos/asignacion", label: "Horario", match: ["/turnos/asignacion", "/equipo/horario"] },
      { href: "/turnos/resumen", label: "Turnos", match: ["/turnos/resumen", "/equipo/turnos"] },
      { href: "/turnos/tareas", label: "Tareas", match: ["/turnos/tareas", "/equipo/tareas"] },
      { href: "/turnos/historial", label: "Historial", match: ["/turnos/historial", "/equipo/historial"] },
      { href: "/turnos/reportes", label: "Reportes", match: ["/turnos/reportes", "/equipo/reportes"] },
    ],
  },
  { id: "mas", href: "/mas", label: "Más", icon: "mas", match: ["/mas"] },
];

/** «Más» — link-cards on /mas and the expanded group in the desktop rail. */
export const MAS_ITEMS: NavItem[] = [
  { id: "caja", href: "/caja", label: "Caja", icon: "caja", sub: "Arqueos, bases y movimientos", match: ["/caja"] },
  { id: "gastos", href: "/gastos", label: "Gastos", icon: "gastos", sub: "Costos fijos y del día", match: ["/gastos"] },
  {
    id: "clientes",
    href: "/calificaciones",
    label: "Clientes",
    icon: "clientes",
    sub: "Reseñas, puntos y baristas",
    match: ["/clientes", "/calificaciones", "/baristas"],
    sections: [
      { href: "/calificaciones", label: "Reseñas y puntos", match: ["/calificaciones"] },
      { href: "/baristas", label: "Baristas", match: ["/baristas", "/clientes/baristas"] },
    ],
  },
  {
    id: "ajustes",
    href: "/configuracion",
    label: "Ajustes",
    icon: "ajustes",
    sub: "Sede, apariencia y dispositivos",
    match: ["/ajustes", "/configuracion"],
    sections: [
      { href: "/configuracion/sede", label: "Sede", match: ["/configuracion/sede", "/ajustes/sede"] },
      { href: "/configuracion/preferencias", label: "Apariencia", match: ["/configuracion/preferencias", "/ajustes/apariencia"] },
      { href: "/configuracion/pos", label: "Dispositivos", match: ["/configuracion/pos", "/ajustes/dispositivos"] },
    ],
  },
  { id: "turno", href: "/turno", label: "Ver como equipo", icon: "turno", sub: "La app de la tablet", match: [] },
  { id: "pos", href: "/pos", label: "Punto de venta", icon: "pos", sub: "Abrir el POS", match: [] },
  { id: "menu", href: "/menu", label: "Menú público", icon: "menu", sub: "Lo que ven los clientes", external: true, match: [] },
];

/** «Más → Avanzado»: live routes without a place in the main navigation. */
export const AVANZADO_ITEMS: NavItem[] = [
  { id: "modificadores", href: "/modificadores", label: "Modificadores", icon: "avanzado", match: [] },
  { id: "combos", href: "/combos", label: "Combos", icon: "avanzado", match: ["/combos"] },
  { id: "precios", href: "/precios", label: "Listas de precios", icon: "avanzado", match: ["/precios"] },
  { id: "importar-factura", href: "/importar-factura", label: "Importar factura", icon: "avanzado", match: ["/importar-factura"] },
  { id: "importacion", href: "/importacion", label: "Importación CSV", icon: "avanzado", match: ["/importacion"] },
  { id: "notificaciones", href: "/notificaciones", label: "Notificaciones", icon: "avanzado", match: ["/notificaciones"] },
  { id: "organizaciones", href: "/organizaciones", label: "Organizaciones", icon: "avanzado", match: [] },
];

/**
 * Pages under «Más» (and Avanzado) light up the Más tab: everything the
 * owner reaches through /mas belongs to it.
 */
export const MAS_MATCH: string[] = [
  "/mas",
  ...MAS_ITEMS.flatMap((i) => i.match ?? []),
  ...AVANZADO_ITEMS.flatMap((i) => i.match ?? []),
];
