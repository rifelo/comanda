/**
 * Navigation model for both faces of the app (docs/redesign/PLAN.md §2).
 *
 * Plain data only — items cross the server→client boundary as props, so
 * icons are names (resolved by components/ui/icon.tsx) and "active" is
 * decided by path prefixes (lib/nav/active.ts), never by functions.
 *
 * Hrefs point at the redesigned routes. The old ones (/catalogo, /recetas,
 * /numeros, /turnos, /configuracion, /calificaciones, /baristas, /historial,
 * /compras…) are redirect pages; `match` keeps them so a stale link still
 * lights the right tab. A section href may carry a query
 * (`/inventario?vista=acabando`): it is active only when the query matches.
 */

export type IconName =
  | "whatsapp"
  | "hoy"
  | "tareas"
  | "caja"
  | "inventario"
  | "pos"
  | "productos"
  | "equipo"
  | "mas"
  | "gastos"
  | "descuentos"
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
  },
  {
    id: "inventario",
    href: "/inventario",
    label: "Inventario",
    icon: "inventario",
    match: ["/inventario", "/historial", "/compras"],
    sections: [
      // Exact /inventario and each insumo's ficha (/inventario/<id>); the
      // named sub-pages below are more specific and win.
      { href: "/inventario", label: "Existencias", match: ["/inventario"] },
      { href: "/inventario/movimientos", label: "Movimientos", match: ["/inventario/movimientos", "/historial", "/inventario/kardex"] },
      { href: "/inventario/pedidos", label: "Pedidos", match: ["/inventario/pedidos", "/compras"] },
      { href: "/inventario/reorden", label: "Punto de reorden", match: ["/inventario/reorden"] },
      { href: "/inventario/proveedores", label: "Proveedores", match: ["/inventario/proveedores"] },
      { href: "/inventario?vista=acabando", label: "Faltantes", match: ["/inventario/faltantes"] },
      { href: "/inventario/conteos", label: "Conteos", match: ["/inventario/conteos"] },
      { href: "/inventario/mermas", label: "Mermas", match: ["/inventario/mermas"] },
      { href: "/inventario/niveles", label: "Niveles", match: ["/inventario/niveles"] },
      { href: "/inventario/sugerencias", label: "Sugerencias", match: ["/inventario/sugerencias"] },
    ],
  },
  {
    id: "productos",
    href: "/productos",
    label: "Productos",
    icon: "productos",
    match: ["/productos", "/catalogo", "/recetas", "/modificadores"],
    sections: [
      { href: "/productos", label: "Productos", match: ["/productos", "/catalogo", "/recetas"] },
      { href: "/modificadores", label: "Modificadores", match: ["/modificadores"] },
    ],
  },
  {
    id: "equipo",
    href: "/equipo",
    label: "Equipo",
    icon: "equipo",
    match: ["/equipo", "/configuracion/equipo", "/turnos"],
    sections: [
      { href: "/equipo", label: "Personas", match: ["/configuracion/equipo"] },
      { href: "/equipo/horario", label: "Horario", match: ["/equipo/horario", "/turnos/asignacion"] },
      { href: "/equipo/turnos", label: "Turnos", match: ["/equipo/turnos", "/turnos/resumen"] },
      { href: "/equipo/tareas", label: "Tareas", match: ["/equipo/tareas", "/turnos/tareas"] },
      { href: "/equipo/historial", label: "Historial", match: ["/equipo/historial", "/turnos/historial"] },
      { href: "/equipo/reportes", label: "Reportes", match: ["/equipo/reportes", "/turnos/reportes"] },
    ],
  },
  { id: "mas", href: "/mas", label: "Más", icon: "mas", match: ["/mas"] },
];

/** «Más» — link-cards on /mas and the expanded group in the desktop rail. */
export const MAS_ITEMS: NavItem[] = [
  { id: "caja", href: "/caja", label: "Caja", icon: "caja", sub: "Arqueos, bases y movimientos", match: ["/caja"] },
  { id: "descuentos", href: "/descuentos", label: "Descuentos", icon: "descuentos", sub: "Precios especiales que pide la caja", match: ["/descuentos"] },
  { id: "gastos", href: "/gastos", label: "Gastos", icon: "gastos", sub: "Costos fijos y del día", match: ["/gastos"] },
  { id: "whatsapp", href: "/whatsapp", label: "WhatsApp", icon: "whatsapp", sub: "Conversaciones del agente y entregas", match: ["/whatsapp"] },
  {
    id: "clientes",
    href: "/clientes",
    label: "Clientes",
    icon: "clientes",
    sub: "Reseñas, puntos y baristas",
    match: ["/clientes", "/calificaciones", "/baristas"],
    sections: [
      { href: "/clientes", label: "Reseñas", match: ["/calificaciones"] },
      { href: "/clientes/puntos", label: "Puntos", match: ["/clientes/puntos"] },
      { href: "/clientes/baristas", label: "Baristas", match: ["/clientes/baristas", "/baristas"] },
    ],
  },
  {
    id: "ajustes",
    href: "/ajustes",
    label: "Ajustes",
    icon: "ajustes",
    sub: "Sede, apariencia y dispositivos",
    match: ["/ajustes", "/configuracion"],
    sections: [
      { href: "/ajustes/sede", label: "Sede", match: ["/ajustes/sede", "/configuracion/sede"] },
      { href: "/ajustes/apariencia", label: "Apariencia", match: ["/ajustes/apariencia", "/configuracion/preferencias"] },
      { href: "/ajustes/dispositivos", label: "Dispositivos", match: ["/ajustes/dispositivos", "/configuracion/pos"] },
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
