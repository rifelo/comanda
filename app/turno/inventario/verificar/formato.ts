import { nombrePaquete } from "@/lib/inventario/niveles";

/**
 * Number formatting for the verification screens, deterministic (no ICU):
 * «1.340», «0,5», «−16». Used on the server and the client alike.
 */
export function fmtNum(n: number, decimales = 3): string {
  const f = 10 ** decimales;
  const r = Math.round(n * f) / f;
  const neg = r < 0;
  const [ent, dec] = String(Math.abs(r)).split(".");
  const miles = ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${neg ? "−" : ""}${miles}${dec ? `,${dec}` : ""}`;
}

/** Units measured by weight or volume: there a piece (bolsa de 900 ml) is how people say it. */
export const esMedida = (unit: string) => /^(g|gr|kg|ml|l|lt|cc|oz)$/i.test(unit.trim());

/** Units that take a decimal comma on the keypad (1,5 kg). */
export const conDecimales = (unit: string) => /^(kg|l|lt)$/i.test(unit.trim());

/**
 * A quantity the way it is said at the bar: «9 bolsas» for a measure with a
 * piece, «87 und» / «1.340 g» otherwise (cups are counted one by one, even
 * when they come in packs of 50).
 */
export function legible(qty: number, it: { unit: string; pieza: number | null; packLabel: string | null }): string {
  if (it.pieza && it.pieza > 1 && esMedida(it.unit)) {
    const packs = Math.round((qty / it.pieza) * 10) / 10;
    return `${fmtNum(packs, 1)} ${nombrePaquete({ pack_label: it.packLabel }, Math.abs(packs))}`;
  }
  return `${fmtNum(qty)} ${it.unit}`;
}
