/**
 * The order a customer puts together on cafepayo.com/menu and sends as a
 * WhatsApp message to the café. Pure (tested in pedido-web.test.ts): the cart
 * arithmetic and the words of the message. Nothing is saved here: the order
 * exists once the café's WhatsApp receives it.
 */
import { money } from "./menu";
import { WHATSAPP_PEDIDOS } from "./origenes";

/** One line of the cart: a product with its chosen option («En leche»), if it has options. */
export interface LineaCarrito {
  sku: string;
  opcion: string | null;
  cantidad: number;
  /** Drinks only: whose cup each one is (the name on its label), by position; a blank one takes the order's name. */
  para?: string[];
}

/** Sections whose products are served in a cup with a name label. */
export const SECCIONES_CON_ETIQUETA: ReadonlyArray<string> = ["caliente", "frio", "jugos"];

/** What a line needs from the menu to be priced and named. */
export interface ProductoCarrito {
  sku: string;
  name: string;
  price: number;
  agotado: boolean;
  options: { name: string; delta: number }[];
  /** Its section on the menu («frio»): decides whether its cups carry a name. */
  cat?: string;
}

export interface LineaPedido {
  clave: string;
  sku: string;
  nombre: string;
  opcion: string | null;
  cantidad: number;
  unitario: number;
  total: number;
  /** A drink: each cup carries a name label. */
  conNombre: boolean;
  /** One entry per cup when `conNombre` ("" = not written yet); empty otherwise. */
  para: string[];
}

export type Entrega =
  | { tipo: "recoger" }
  | { tipo: "domicilio"; direccion: string }
  /** A place with its own QR (the hospital's portería): free, walked over. */
  | { tipo: "punto"; lugar: string };

export const MAX_POR_LINEA = 20;

/** A line's identity in the cart: the same drink in water and in milk are two lines. */
export function claveLinea(sku: string, opcion: string | null): string {
  return `${sku}|${opcion ?? ""}`;
}

/** Add (or take away, with a negative `delta`) units of a line; a line that reaches 0 leaves the cart. */
export function sumar(carrito: ReadonlyArray<LineaCarrito>, sku: string, opcion: string | null, delta: number): LineaCarrito[] {
  const clave = claveLinea(sku, opcion);
  const actual = carrito.find((l) => claveLinea(l.sku, l.opcion) === clave);
  const cantidad = Math.min(MAX_POR_LINEA, Math.max(0, (actual?.cantidad ?? 0) + Math.trunc(delta)));
  if (!actual) return cantidad > 0 ? [...carrito, { sku, opcion, cantidad }] : [...carrito];
  // Taking a cup away takes the last name with it.
  return carrito.flatMap((l) => (l === actual ? (cantidad > 0 ? [{ ...l, cantidad, ...(l.para ? { para: l.para.slice(0, cantidad) } : {}) }] : []) : [l]));
}

/** Add `n` cups of a drink, all for `nombre` (the name typed in its sheet). */
export function agregarPara(carrito: ReadonlyArray<LineaCarrito>, sku: string, opcion: string | null, n: number, nombre: string): LineaCarrito[] {
  const clave = claveLinea(sku, opcion);
  const antes = carrito.find((l) => claveLinea(l.sku, l.opcion) === clave)?.cantidad ?? 0;
  let out = sumar(carrito, sku, opcion, n);
  const ahora = out.find((l) => claveLinea(l.sku, l.opcion) === clave)?.cantidad ?? 0;
  for (let i = antes; i < ahora; i++) out = nombrar(out, sku, opcion, i, nombre.replace(/\s+/g, " ").trim());
  return out;
}

/** Does this section's product go in a cup with a name label? */
export function llevaEtiqueta(cat: string | null | undefined): boolean {
  return !!cat && SECCIONES_CON_ETIQUETA.includes(cat);
}

/** Write whose cup number `i` (from 0) of a line is. */
export function nombrar(carrito: ReadonlyArray<LineaCarrito>, sku: string, opcion: string | null, i: number, nombre: string): LineaCarrito[] {
  const clave = claveLinea(sku, opcion);
  return carrito.map((l) => {
    if (claveLinea(l.sku, l.opcion) !== clave || i < 0 || i >= l.cantidad) return l;
    const para = Array.from({ length: l.cantidad }, (_, k) => l.para?.[k] ?? "");
    para[i] = nombre.slice(0, 40);
    return { ...l, para };
  });
}

/**
 * The cart against today's menu: named and priced lines. What is no longer on
 * the menu, is sold out, or carries an option the product doesn't have (a cart
 * kept from another day) is left out.
 */
export function lineasDelPedido(carrito: ReadonlyArray<LineaCarrito>, productos: ReadonlyMap<string, ProductoCarrito>): LineaPedido[] {
  const out: LineaPedido[] = [];
  for (const l of carrito) {
    const p = productos.get(l.sku);
    if (!p || p.agotado || !Number.isInteger(l.cantidad) || l.cantidad < 1) continue;
    const opt = l.opcion ? p.options.find((o) => o.name === l.opcion) : null;
    if (l.opcion ? !opt : p.options.length > 0) continue;
    const unitario = p.price + (opt?.delta ?? 0);
    const cantidad = Math.min(MAX_POR_LINEA, l.cantidad);
    const conNombre = llevaEtiqueta(p.cat);
    const para = conNombre ? Array.from({ length: cantidad }, (_, k) => (typeof l.para?.[k] === "string" ? l.para[k] : "")) : [];
    out.push({ clave: claveLinea(l.sku, l.opcion), sku: l.sku, nombre: p.name, opcion: l.opcion, cantidad, unitario, total: unitario * cantidad, conNombre, para });
  }
  return out;
}

export function totalPedido(lineas: ReadonlyArray<LineaPedido>): number {
  return lineas.reduce((s, l) => s + l.total, 0);
}

export function unidades(lineas: ReadonlyArray<{ cantidad: number }>): number {
  return lineas.reduce((s, l) => s + l.cantidad, 0);
}

const limpio = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);

/** What is still missing before the order can be sent; null when it is ready. */
export function faltaPara(lineas: ReadonlyArray<LineaPedido>, nombre: string, entrega: Entrega): string | null {
  if (!lineas.length) return "Agrega al menos un producto.";
  if (!limpio(nombre, 60)) return "Escribe tu nombre.";
  if (entrega.tipo === "domicilio" && limpio(entrega.direccion, 160).length < 5) return "Escribe la dirección de entrega.";
  return null;
}

/** The WhatsApp message: one product per line, the total, who it is for and where it goes. */
export function mensajePedido(lineas: ReadonlyArray<LineaPedido>, datos: { nombre: string; entrega: Entrega; nota?: string }): string {
  const e = datos.entrega;
  const donde =
    e.tipo === "domicilio"
      ? `Domicilio: ${limpio(e.direccion, 160)}`
      : e.tipo === "punto"
        ? `Entrega: ${limpio(e.lugar, 120)}`
        : "Entrega: lo recojo en el café";
  const nota = limpio(datos.nota ?? "", 240);
  return [
    "Hola, quiero hacer este pedido:",
    ...lineas.map((l) => `• ${l.cantidad} × ${l.nombre}${l.opcion ? ` (${l.opcion.charAt(0).toLowerCase()}${l.opcion.slice(1)})` : ""} — ${money(l.total)}${paraQuien(l, datos.nombre)}`),
    `Total productos: ${money(totalPedido(lineas))}`,
    donde,
    `A nombre de: ${limpio(datos.nombre, 60)}`,
    ...(nota ? [`Nota: ${nota}`] : []),
  ].join("\n");
}

/**
 * « · para Ana, Luis»: the names for a drink's labels, one per cup. A cup left
 * blank takes the order's name; a line where nobody wrote a name says nothing
 * (the order's name covers it).
 */
function paraQuien(l: LineaPedido, nombre: string): string {
  if (!l.conNombre || !l.para.some((n) => limpio(n, 40))) return "";
  return ` · para ${l.para.map((n) => limpio(n, 40) || limpio(nombre, 60)).join(", ")}`;
}

/** The café's WhatsApp chat with the message already written. */
export function enlaceWhatsapp(texto: string): string {
  return `https://wa.me/${WHATSAPP_PEDIDOS}?text=${encodeURIComponent(texto)}`;
}
