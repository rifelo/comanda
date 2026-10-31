import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, toAppTheme } from "./theme";

describe("toAppTheme", () => {
  it("keeps the new values", () => {
    expect(toAppTheme("claro")).toBe("claro");
    expect(toAppTheme("oscuro")).toBe("oscuro");
    expect(toAppTheme("auto")).toBe("auto");
  });

  it("maps the old paper themes", () => {
    expect(toAppTheme("papel")).toBe("claro");
    expect(toAppTheme("sepia")).toBe("claro");
    expect(toAppTheme("indigo")).toBe("claro");
    expect(toAppTheme("rojo")).toBe("claro");
    expect(toAppTheme("carbon")).toBe("oscuro");
  });

  it("falls back on empty or unknown", () => {
    expect(toAppTheme(undefined)).toBe(DEFAULT_THEME);
    expect(toAppTheme("")).toBe(DEFAULT_THEME);
    expect(toAppTheme("neon")).toBe(DEFAULT_THEME);
    expect(toAppTheme(null, "auto")).toBe("auto");
  });
});
