/**
 * The café's couriers (organizations.domiciliarios, one «Nombre número» per
 * line) and the WhatsApp message the register sends them for a delivery.
 * Pure, so tested.
 */
export type Domiciliario = { nombre: string; numero: string };

/** «Danny 314 469 5514» → { nombre: "Danny", numero: "573144695514" }; lines without a number are skipped. */
export function leerDomiciliarios(texto: string | null | undefined): Domiciliario[] {
  return (texto ?? "")
    .split(/\n|;/)
    .map((l) => l.trim())
    .filter(Boolean)
    .flatMap((l) => {
      // The last phone-like run of digits on the line (hours like «9 a. m.–10 p. m.» may come before it).
      const tel = [...l.matchAll(/\+?\d[\d\s().-]{8,}\d/g)].map((m) => ({ txt: m[0], dig: m[0].replace(/\D/g, "") })).filter((m) => m.dig.length >= 10 && m.dig.length <= 13).at(-1);
      if (!tel) return [];
      const numero = tel.dig.length === 10 ? `57${tel.dig}` : tel.dig;
      const nombre = l.replace(tel.txt, "").replace(/[·:,-]+\s*$/, "").replace(/\s+/g, " ").trim() || "Domiciliario";
      return [{ nombre, numero }];
    });
}

/** Line errors for the settings form (a line that has no usable number). */
export function lineasSinNumero(texto: string): string[] {
  return texto
    .split(/\n|;/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => leerDomiciliarios(l).length === 0);
}

export type PedidoDomicilio = {
  folio: string;
  cliente: string;
  telefono: string | null;
  direccion: string | null;
  items: { qty: number; name: string }[];
  total: number;
  pagado: boolean;
};

const pesos = (n: number) => "$" + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** What the courier needs, ready to send. */
export function mensajeDomiciliario(d: Domiciliario, p: PedidoDomicilio, cafe = "PA'YO"): string {
  const nombre = d.nombre.replace(/\s*\(.*\)\s*$/, "");
  return [
    `Hola ${nombre}, hay un domicilio de ${cafe} 🛵`,
    `Pedido ${p.folio}`,
    `Recibe: ${p.cliente || "(confirmar)"}${p.telefono ? ` · Tel ${p.telefono}` : ""}`,
    `Dirección: ${p.direccion ?? "(confirmar con el cliente)"}`,
    `Productos: ${p.items.map((i) => `${i.qty} × ${i.name}`).join(", ")}`,
    p.pagado ? `El cliente ya pagó ${pesos(p.total)} por transferencia ✅, no hay que cobrarle` : `Cobrar al entregar: ${pesos(p.total)}`,
    `El domicilio te lo pagamos desde ${cafe} por transferencia 🙌`,
  ].join("\n");
}

/** wa.me link that opens WhatsApp (Business) with the message written. */
export const enlaceWhatsapp = (numero: string, texto: string) => `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
