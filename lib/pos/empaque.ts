/**
 * Packaging a take-away or delivery order takes (mig 0083). Pure, unit-tested.
 *
 * Drinks go in cup holders, and each holder goes in a kraft bag:
 *   2 drinks → 1 holder of 2 + 1 medium bag
 *   3–4 drinks → 1 holder of 4 + 1 large bag
 *   more → one holder of 4 + large bag per 4 drinks, then the rest as above
 *   (a single drink left over travels in the hand: nothing — except on a
 *   delivery, where it also goes in a holder of 2 + medium bag).
 * Each food item (pastel, torta…) takes one greaseproof bag.
 * An order eaten at the café («aquí») takes nothing.
 *
 * A delivery pays for that packaging: one «Empaque domicilio» line (the
 * product with SKU EMPAQUE_DOMICILIO_SKU, its price from the catalog) per bag,
 * a bag holding up to 4 drinks.
 */

/** SKU of the product charged per bag on deliveries. */
export const EMPAQUE_DOMICILIO_SKU = "EM-001";

/** Bags a delivery is charged for: one per 4 drinks, none without drinks. */
export function bolsasDomicilio(bebidas: number): number {
  return Math.ceil(Math.max(0, Math.floor(bebidas)) / 4);
}

export type EmpaqueRol = "portavasos_2" | "portavasos_4" | "bolsa_mediana" | "bolsa_grande" | "bolsa_comida";
export type OrderType = "aqui" | "llevar" | "domicilio";

export function empaqueDePedido(p: { orderType: string; bebidas: number; comidas: number }): Map<EmpaqueRol, number> {
  const out = new Map<EmpaqueRol, number>();
  if (p.orderType !== "llevar" && p.orderType !== "domicilio") return out;
  const add = (rol: EmpaqueRol, n: number) => {
    if (n > 0) out.set(rol, (out.get(rol) ?? 0) + n);
  };
  const bebidas = Math.max(0, Math.floor(p.bebidas));
  let de4 = Math.floor(bebidas / 4);
  let de2 = 0;
  const resto = bebidas % 4;
  if (resto === 3) de4 += 1;
  else if (resto === 2 || (resto === 1 && p.orderType === "domicilio")) de2 += 1;
  add("portavasos_4", de4);
  add("bolsa_grande", de4);
  add("portavasos_2", de2);
  add("bolsa_mediana", de2);
  add("bolsa_comida", Math.max(0, Math.floor(p.comidas)));
  return out;
}
