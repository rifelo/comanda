import { describe, expect, it } from "vitest";
import { atiendeA, usaConsola } from "./probadores";

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

describe("usaConsola", () => {
  it("is off by default, on for listed numbers or everyone", () => {
    expect(usaConsola("573106059758", "")).toBe(false);
    expect(usaConsola("573106059758", "573106059758, 573223055222")).toBe(true);
    expect(usaConsola("573001112233", "573106059758")).toBe(false);
    expect(usaConsola("RS.123", "todos")).toBe(true);
  });
});
