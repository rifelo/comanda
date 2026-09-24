/**
 * Task instructions are written as "1) … 2) … 3) …" (see
 * scripts/seed-turno-noche.mjs). On the tablet a wall of text is hard to
 * follow while your hands are wet, so the checklist renders them as numbered
 * steps. Pure; unit-tested in steps.test.ts.
 */

export interface Steps {
  /** Text before the first numbered step (context), or null. */
  intro: string | null;
  steps: string[];
  /** Sentences after the last step (a note), or null. */
  note: string | null;
}

const STEP_RE = /(?:^|\s)(\d{1,2})\)\s+/g;

/** Splits "1) a. 2) b. Note." into steps; plain text (no "1) … 2) …") → no steps. */
export function splitSteps(text: string | null | undefined): Steps {
  const src = (text ?? "").replace(/\s+/g, " ").trim();
  if (!src) return { intro: null, steps: [], note: null };
  const marks = [...src.matchAll(STEP_RE)];
  if (marks.length < 2 || marks[0][1] !== "1") return { intro: src, steps: [], note: null };
  const intro = src.slice(0, marks[0].index).trim() || null;
  const steps: string[] = [];
  for (let i = 0; i < marks.length; i++) {
    const start = (marks[i].index ?? 0) + marks[i][0].length;
    const end = i + 1 < marks.length ? (marks[i + 1].index ?? src.length) : src.length;
    steps.push(src.slice(start, end).trim());
  }
  // The last "step" often runs into a closing note ("… filtro normal. Puedes
  // lavar varios grupos a la vez."): keep its first sentence as the step.
  let note: string | null = null;
  const last = steps[steps.length - 1];
  const cut = last.search(/[.!?]\s+(?=[A-ZÁÉÍÓÚÑ¿¡])/);
  if (cut > 0) {
    steps[steps.length - 1] = last.slice(0, cut + 1).trim();
    note = last.slice(cut + 1).trim() || null;
  }
  return { intro, steps, note };
}
