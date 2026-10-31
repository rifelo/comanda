import { describe, expect, it } from "vitest";
import { ACCESO, PASSWORD_MIN, accesoDe, sugerirContrasena } from "./acceso";

describe("accesoDe", () => {
  it("reads providers from both backends", () => {
    expect(accesoDe(["email"])).toBe("password");
    expect(accesoDe(["credential"])).toBe("password");
    expect(accesoDe(["google"])).toBe("google");
    expect(accesoDe(["google", "email"])).toBe("ambos");
    expect(accesoDe([])).toBe("ninguno");
    expect(accesoDe(null)).toBe("ninguno");
  });
  it("only password accounts can use the tablet tiles", () => {
    expect(ACCESO.password.tablet).toBe(true);
    expect(ACCESO.ambos.tablet).toBe(true);
    expect(ACCESO.google.tablet).toBe(false);
  });
});

describe("sugerirContrasena", () => {
  it("is long enough and deterministic with a fixed random", () => {
    const pw = sugerirContrasena(() => 0.5);
    expect(pw).toBe("tinto-5500");
    expect(pw.length).toBeGreaterThanOrEqual(PASSWORD_MIN);
    expect(sugerirContrasena(() => 0).length).toBeGreaterThanOrEqual(PASSWORD_MIN);
    expect(sugerirContrasena(() => 0.9999).length).toBeGreaterThanOrEqual(PASSWORD_MIN);
  });
});
