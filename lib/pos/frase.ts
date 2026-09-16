/**
 * Pure helpers for the AI "frase del día" label (no I/O): category pick and
 * text normalisation. The generator itself lives in lib/ai/frase.ts.
 */

export const FRASE_CATEGORIAS = ["gracioso", "motivador", "noticia"] as const;
export type FraseCategoria = (typeof FRASE_CATEGORIAS)[number];

/** Weighted pick: humour most often, a Colombian news nod least (it costs a web search). */
export function pickCategoria(rand: number = Math.random()): FraseCategoria {
  if (rand < 0.45) return "gracioso";
  if (rand < 0.8) return "motivador";
  return "noticia";
}

export const FRASE_MAX = 140;

/**
 * Strip emoji, trim, collapse whitespace, strip wrapping quotes and cap the length so the
 * phrase always fits the label (4 lines max at the smallest font).
 */
export function sanitizeFrase(text: string): string {
  // Citation markers from web-search answers (【1†L9-L13】, [1]) never belong on a cup.
  let t = text.replace(/【[^】]*】/g, "").replace(/\[\d+\]/g, "");
  // No emoji: the model is told so, but strip any that slip through
  // (pictographs, variation selectors, ZWJ, skin tones, keycaps, flags).
  t = t.replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}\u{20E3}]/gu, "");
  t = t.replace(/\s+/g, " ").trim();
  t = t.replace(/^["“«']+|["”»']+$/g, "").trim();
  if (t.length > FRASE_MAX) {
    const cut = t.slice(0, FRASE_MAX);
    const sp = cut.lastIndexOf(" ");
    t = (sp > FRASE_MAX * 0.6 ? cut.slice(0, sp) : cut).trim() + "…";
  }
  return t;
}
