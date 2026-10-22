/**
 * es-CO number formatting for the kardex, without Intl so SSR and the browser
 * agree. Tested in kardex-format.test.ts.
 */

/** 10800 → "10.800", 3.89 → "3,89", 35960.5 → "35.960,5", 1080 → "1.080". */
export function fmtNum(n: number, maxDec = 3): string {
  const r = Math.round(n * 10 ** maxDec) / 10 ** maxDec;
  // Only trailing zeros AFTER the decimal point go; an integer keeps its zeros.
  const [int, decRaw = ""] = Math.abs(r).toFixed(maxDec).split(".");
  const dec = decRaw.replace(/0+$/, "");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${r < 0 ? "−" : ""}${grouped}${dec ? `,${dec}` : ""}`;
}

/** −1080 → "−$1.080" (rounded to whole pesos). */
export function fmtCop(n: number): string {
  return `${n < 0 ? "−" : ""}$${fmtNum(Math.abs(Math.round(n)), 0)}`;
}
