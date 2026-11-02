import { describe, expect, it } from "vitest";
import { atiendeA } from "./probadores";

describe("atiendeA", () => {
  it("answers everyone when the agent is on", () => {
    expect(atiendeA(true, "573001112233", "")).toBe(true);
  });
  it("answers only the test numbers when it is off", () => {
    const lista = "573001112233, +57 310 555 6677";
    expect(atiendeA(false, "573001112233", lista)).toBe(true);
    expect(atiendeA(false, "573105556677", lista)).toBe(true);
    expect(atiendeA(false, "573009998877", lista)).toBe(false);
  });
  it("answers nobody when off with no list", () => {
    expect(atiendeA(false, "573001112233", "")).toBe(false);
    expect(atiendeA(false, "", " , ")).toBe(false);
  });
});
