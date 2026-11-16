import { describe, expect, it } from "vitest";
import { enlazarClaves, habitosDePedidos, telefonoDe, usuario } from "./ficha";

const vacia = { wa_id: null, user_id: null, username: null };

describe("enlazarClaves", () => {
  it("links a file pre-loaded by @username to the phone that writes", () => {
    expect(enlazarClaves({ ...vacia, username: "bibizperez" }, { waId: "573223055222", userId: "RS.1", username: "BibizPerez" })).toEqual({
      wa_id: "573223055222",
      user_id: "RS.1",
    });
  });
  it("uses the BSUID as the key when there is no phone", () => {
    expect(enlazarClaves({ ...vacia, username: "ana" }, { waId: "RS.9", userId: "RS.9", username: "ana" })).toEqual({ wa_id: "RS.9", user_id: "RS.9" });
  });
  it("never replaces a known phone with a BSUID", () => {
    expect(enlazarClaves({ wa_id: "573001112233", user_id: "RS.9", username: "ana" }, { waId: "RS.9", userId: "RS.9", username: "ana" })).toEqual({});
  });
  it("upgrades a BSUID key to the phone once it shows up", () => {
    expect(enlazarClaves({ wa_id: "RS.9", user_id: "RS.9", username: "ana" }, { waId: "573001112233", userId: "RS.9", username: "ana" })).toEqual({
      wa_id: "573001112233",
    });
  });
  it("follows a changed @username", () => {
    expect(enlazarClaves({ wa_id: "573001112233", user_id: null, username: "ana" }, { waId: "573001112233", userId: null, username: "@ana.cafe" })).toEqual({
      username: "ana.cafe",
    });
  });
});

describe("telefonoDe / usuario", () => {
  it("prefers the phone that wrote, else the one on file", () => {
    expect(telefonoDe({ waId: "573001112233", userId: null, username: null }, null)).toBe("573001112233");
    expect(telefonoDe({ waId: "RS.9", userId: "RS.9", username: null }, { wa_id: "573001112233", user_id: "RS.9", username: null })).toBe("573001112233");
    expect(telefonoDe({ waId: "RS.9", userId: "RS.9", username: null }, { wa_id: "RS.9", user_id: "RS.9", username: null })).toBeNull();
  });
  it("normalises usernames", () => {
    expect(usuario("@BibizPerez ")).toBe("bibizperez");
    expect(usuario("")).toBeNull();
  });
});

describe("habitosDePedidos", () => {
  const grupos = { leche: { name: "Leche" }, tam: { name: "Tamaño" }, extra: { name: "Extras" } };
  it("lists options repeated in most orders", () => {
    const mods: Record<string, string | string[]>[] = [
      { leche: "Deslactosada", tam: "16 oz" },
      { leche: "Deslactosada", tam: "12 oz" },
      { leche: "Deslactosada", tam: "16 oz", extra: ["Vainilla"] },
      { leche: "Entera" },
    ];
    expect(habitosDePedidos(mods, grupos)).toEqual(["Leche: Deslactosada (3 de 4 veces)", "Tamaño: 16 oz (2 de 3 veces)"]);
  });
  it("ignores one-offs, unknown groups and empty picks", () => {
    expect(habitosDePedidos([{ extra: ["Vainilla"] }, { otro: "x" }, { tam: "" }], grupos)).toEqual([]);
  });
});
