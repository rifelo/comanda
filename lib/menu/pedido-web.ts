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
}

/** What a line needs from the menu to be priced and named. */
export interface ProductoCarrito {
  sku: string;
  name: string;
  price: number;
  agotado: boolean;
  options: { name: string; delta: number }[];
}

export interface LineaPedido {
  clave: string;
  sku: string;
  nombre: string;
  opcion: string | null;
  cantidad: number;
  unitario: number;
  total: number;
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
  return carrito.flatMap((l) => (l === actual ? (cantidad > 0 ? [{ ...l, cantidad }] : []) : [l]));
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
    out.push({ clave: claveLinea(l.sku, l.opcion), sku: l.sku, nombre: p.name, opcion: l.opcion, cantidad, unitario, total: unitario * cantidad });
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
    ...lineas.map((l) => `• ${l.cantidad} × ${l.nombre}${l.opcion ? ` (${l.opcion.charAt(0).toLowerCase()}${l.opcion.slice(1)})` : ""} — ${money(l.total)}`),
    `Total productos: ${money(totalPedido(lineas))}`,
    donde,
    `A nombre de: ${limpio(datos.nombre, 60)}`,
    ...(nota ? [`Nota: ${nota}`] : []),
  ].join("\n");
}

/** The café's WhatsApp chat with the message already written. */
export function enlaceWhatsapp(texto: string): string {
  return `https://wa.me/${WHATSAPP_PEDIDOS}?text=${encodeURIComponent(texto)}`;
}
