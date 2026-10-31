import { describe, expect, it } from "vitest";
import { initialsOf, landingFor, parseCreadoPor, pickBarista, pickCreatedBy, safeNext } from "./auth-person";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

describe("safeNext", () => {
  it("keeps relative app paths", () => {
    expect(safeNext("/pos")).toBe("/pos");
    expect(safeNext("/turno/caja?x=1")).toBe("/turno/caja?x=1");
  });
  it("drops external, protocol-relative and empty targets", () => {
    expect(safeNext("https://evil.com")).toBeNull();
    expect(safeNext("//evil.com")).toBeNull();
    expect(safeNext("/\\evil.com")).toBeNull();
    expect(safeNext("")).toBeNull();
    expect(safeNext(undefined)).toBeNull();
    expect(safeNext(null)).toBeNull();
  });
  it("never sends you back to the login", () => {
    expect(safeNext("/login")).toBeNull();
    expect(safeNext("/login?switch=1")).toBeNull();
  });
});

describe("landingFor", () => {
  it("honours a valid next for everybody", () => {
    expect(landingFor("staff", false, "/pos")).toBe("/pos");
    expect(landingFor("admin", true, "/pos")).toBe("/pos");
    expect(landingFor("admin", false, "/inventario")).toBe("/inventario");
  });
  it("ignores an unsafe next", () => {
    expect(landingFor("admin", false, "//evil.com")).toBe("/hoy");
    expect(landingFor("staff", false, "https://x.y")).toBe("/turno");
  });
  it("on a paired device everybody (owner included) lands on the shift app", () => {
    expect(landingFor("admin", true)).toBe("/turno");
    expect(landingFor("staff", true)).toBe("/turno");
  });
  it("on a personal device: owner → panel, team → shift app", () => {
    expect(landingFor("admin", false)).toBe("/hoy");
    expect(landingFor("staff", false)).toBe("/turno");
    expect(landingFor("staff", false, null)).toBe("/turno");
  });
});

describe("initialsOf", () => {
  it("matches the roster rule", () => {
    expect(initialsOf("Pipe Cipagauta")).toBe("PC");
    expect(initialsOf("Andres")).toBe("AN");
    expect(initialsOf("")).toBe("XX");
  });
});

describe("parseCreadoPor", () => {
  it("accepts a uuid and lowercases it", () => {
    expect(parseCreadoPor(A)).toBe(A);
    expect(parseCreadoPor(A.toUpperCase())).toBe(A);
  });
  it("rejects anything else", () => {
    expect(parseCreadoPor("abc")).toBeNull();
    expect(parseCreadoPor(42)).toBeNull();
    expect(parseCreadoPor(undefined)).toBeNull();
    expect(parseCreadoPor(`${A}; drop table`)).toBeNull();
  });
});

describe("pickCreatedBy (creadoPor validator)", () => {
  it("a signed-in account on its own device is always the creator", () => {
    expect(pickCreatedBy({ kind: "user", profileId: A }, B, true)).toBe(A);
  });
  it("paired device with a person in session → the person, whatever creadoPor says", () => {
    expect(pickCreatedBy({ kind: "device", person: { profileId: A } }, B, true)).toBe(A);
  });
  it("paired device, session gone (offline replay) → creadoPor only when it is a member", () => {
    expect(pickCreatedBy({ kind: "device", person: null }, B, true)).toBe(B);
    expect(pickCreatedBy({ kind: "device", person: null }, B, false)).toBeNull();
  });
  it("paired device, no session and no/invalid creadoPor → null", () => {
    expect(pickCreatedBy({ kind: "device", person: null }, undefined, true)).toBeNull();
    expect(pickCreatedBy({ kind: "device", person: null }, "not-a-uuid", true)).toBeNull();
  });
});

describe("pickBarista", () => {
  const equipo = [{ id: A }, { id: B }];
  it("keeps the picked barista when on the team", () => {
    expect(pickBarista(B, A, equipo)).toBe(B);
  });
  it("drops a picked barista who is not on the team (no fallback)", () => {
    expect(pickBarista(C, A, equipo)).toBeNull();
  });
  it("defaults to the creator when they are on the team", () => {
    expect(pickBarista(undefined, A, equipo)).toBe(A);
    expect(pickBarista("", A, equipo)).toBe(A);
  });
  it("no default when the creator is not on the team (e.g. the owner)", () => {
    expect(pickBarista(undefined, C, equipo)).toBeNull();
    expect(pickBarista(undefined, null, equipo)).toBeNull();
  });
});
