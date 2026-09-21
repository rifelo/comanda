import { describe, expect, it } from "vitest";
import { prepSteps } from "./types";

describe("prepSteps", () => {
  it("splits lines, trims, drops blanks and strips numbering", () => {
    expect(prepSteps("1. Muele 18 g\n2) Extrae 36 g\n\n- Textura la leche\n• Sirve ")).toEqual(["Muele 18 g", "Extrae 36 g", "Textura la leche", "Sirve"]);
  });
  it("handles Windows line breaks and empty input", () => {
    expect(prepSteps("a\r\nb")).toEqual(["a", "b"]);
    expect(prepSteps(null)).toEqual([]);
    expect(prepSteps("   ")).toEqual([]);
  });
});
