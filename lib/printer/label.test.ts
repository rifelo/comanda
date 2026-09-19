import { describe, expect, it } from "vitest";
import { breakDrinkName, drinkKicker, instagramLink, orderNumber, rosterLine } from "./label";

describe("drinkKicker", () => {
  it("names the person, uppercased, with the brand's Pa'", () => {
    expect(drinkKicker("Juan", "Cafe PA'YO")).toBe("PA' JUAN");
    expect(drinkKicker("  juan   carlos ", "x")).toBe("PA' JUAN CARLOS");
    expect(drinkKicker("María", "x")).toBe("PA' MARÍA");
  });
  it("falls back to the brand when there is no person", () => {
    expect(drinkKicker(undefined, "Cafe PA'YO")).toBe("CAFE PA'YO");
    expect(drinkKicker("   ", "Cafe PA'YO")).toBe("CAFE PA'YO");
    expect(drinkKicker(null, null)).toBe("");
  });
});

describe("rosterLine", () => {
  const upTo = (n: number) => (s: string) => s.length <= n;
  it("joins the names when they fit", () => {
    expect(rosterLine(["Juan", "María"], upTo(40))).toBe("Juan · María");
  });
  it("drops names from the end and counts the rest", () => {
    expect(rosterLine(["Juan", "María", "Pedro", "Camila"], upTo(20))).toBe("Juan · María +2");
    expect(rosterLine(["Juan", "María", "Pedro"], upTo(9))).toBe("Juan +2");
  });
  it("gives up to a count when not even one name fits", () => {
    expect(rosterLine(["Maximiliano"], upTo(5))).toBe("1 personas");
    expect(rosterLine([], upTo(40))).toBe("");
    expect(rosterLine(["  ", "Ana "], upTo(40))).toBe("Ana");
  });
});

describe("orderNumber", () => {
  it("strips the series prefix from a folio", () => {
    expect(orderNumber("A-247")).toBe("247");
    expect(orderNumber("A-1")).toBe("1");
    expect(orderNumber(" B-12 ")).toBe("12");
  });
  it("leaves folios without a prefix alone", () => {
    expect(orderNumber("PRUEBA")).toBe("PRUEBA");
    expect(orderNumber("31")).toBe("31");
  });
});

describe("instagramLink", () => {
  it("normalises the handle and builds the profile URL", () => {
    expect(instagramLink("cafepayo")).toEqual({ handle: "cafepayo", url: "https://www.instagram.com/cafepayo" });
    expect(instagramLink(" @CafePayo/ ")).toEqual({ handle: "cafepayo", url: "https://www.instagram.com/cafepayo" });
  });
});

describe("breakDrinkName", () => {
  // 10 px per character, so a 60 px line holds six.
  const width = (t: string) => t.length * 10;

  it("keeps a name that fits on one line", () => {
    expect(breakDrinkName("X-PRESSO", 2, 100, width)).toEqual(["X-PRESSO"]);
  });
  it("uppercases and opens the next line with an apostrophe when it breaks between words", () => {
    expect(breakDrinkName("Latte frío", 2, 60, width)).toEqual(["LATTE", "'FRÍO"]);
  });
  it("closes the line with an apostrophe when it has to cut a word", () => {
    expect(breakDrinkName("Americano", 2, 60, width)).toEqual(["AMERI'", "CANO"]);
  });
  it("uses the third line only when asked for it", () => {
    expect(breakDrinkName("Aromática de panela", 2, 70, width)).toBeNull();
    expect(breakDrinkName("Aromática de panela", 3, 70, width)).toEqual(["AROMÁT'", "ICA DE", "'PANELA"]);
  });
  it("gives up when the name cannot fit in the lines allowed", () => {
    expect(breakDrinkName("Americano", 1, 60, width)).toBeNull();
    expect(breakDrinkName("   ", 2, 60, width)).toBeNull();
  });
});
