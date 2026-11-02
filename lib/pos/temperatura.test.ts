import { describe, expect, it } from "vitest";
import { filtrarTemp, temperaturaDe } from "./temperatura";

describe("temperaturaDe", () => {
  it("reads the sub-category", () => {
    expect(temperaturaDe({ sub: "Caliente" })).toBe("caliente");
    expect(temperaturaDe({ sub: "Frío" })).toBe("frio");
    expect(temperaturaDe({ sub: "Jugos" })).toBe("frio");
    expect(temperaturaDe({ sub: "Envasadas" })).toBe("frio");
    expect(temperaturaDe({ sub: "Kombucha" })).toBe("frio");
    expect(temperaturaDe({ sub: "" })).toBeNull();
    expect(temperaturaDe({ sub: "Postres" })).toBeNull();
  });
  it("filters", () => {
    const xs = [{ id: 1, sub: "Caliente" }, { id: 2, sub: "Frío" }, { id: 3, sub: "" }];
    expect(filtrarTemp(xs, "todo").map((x) => x.id)).toEqual([1, 2, 3]);
    expect(filtrarTemp(xs, "frio").map((x) => x.id)).toEqual([2]);
    expect(filtrarTemp(xs, "caliente").map((x) => x.id)).toEqual([1]);
  });
});
