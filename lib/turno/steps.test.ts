import { describe, expect, it } from "vitest";
import { splitSteps } from "./steps";

describe("splitSteps", () => {
  it("returns plain text untouched", () => {
    expect(splitSteps("Que quede sin residuos.")).toEqual({ intro: "Que quede sin residuos.", steps: [], note: null });
    expect(splitSteps(null)).toEqual({ intro: null, steps: [], note: null });
  });
  it("splits numbered steps and keeps the trailing note apart", () => {
    const r = splitSteps("1) Pon el filtro ciego. 2) Engánchalo en el grupo. 3) Quita el filtro ciego y pon el normal. Puedes lavar varios grupos a la vez. Sin detergente.");
    expect(r.intro).toBeNull();
    expect(r.steps).toEqual(["Pon el filtro ciego.", "Engánchalo en el grupo.", "Quita el filtro ciego y pon el normal."]);
    expect(r.note).toBe("Puedes lavar varios grupos a la vez. Sin detergente.");
  });
  it("keeps context before the first step", () => {
    const r = splitSteps("Por ahora sin detergente: solo agua. 1) Filtro ciego. 2) Engancha en el grupo: los LEDs parpadean.");
    expect(r.intro).toBe("Por ahora sin detergente: solo agua.");
    expect(r.steps).toEqual(["Filtro ciego.", "Engancha en el grupo: los LEDs parpadean."]);
    expect(r.note).toBeNull();
  });
  it("needs at least two steps starting at 1)", () => {
    expect(splitSteps("1) solo uno.").steps).toEqual([]);
    expect(splitSteps("2) dos. 3) tres.").steps).toEqual([]);
  });
});
