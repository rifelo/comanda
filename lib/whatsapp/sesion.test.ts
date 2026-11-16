import { describe, expect, it } from "vitest";
import { esLimitePorNumero, nuevoDesdeRespuesta, sesionVigente, ultimaSesion } from "./sesion";

const t = (hhmm: string, texto: string) => ({ at: new Date(`2026-11-15T${hhmm}:00-05:00`), texto });

describe("ultimaSesion", () => {
  it("drops what came before a silence of more than an hour", () => {
    const turnos = [t("21:41", "Hola"), t("21:59", "¿descuento?"), t("23:40", "Buenos días"), t("23:41", "un café")];
    expect(ultimaSesion(turnos).map((x) => x.texto)).toEqual(["Buenos días", "un café"]);
  });
  it("keeps a conversation with short pauses whole", () => {
    const turnos = [t("07:50", "Hola"), t("08:09", "¿Aún no?"), t("08:40", "Gracias")];
    expect(ultimaSesion(turnos)).toHaveLength(3);
  });
  it("handles empty history", () => {
    expect(ultimaSesion([])).toEqual([]);
  });
});

describe("esLimitePorNumero", () => {
  it("spots the per-number rate limit", () => {
    expect(esLimitePorNumero('WhatsApp 429: "Too many requests for one number"')).toBe(true);
    expect(esLimitePorNumero("WhatsApp 400: (#131056) Pair rate limit")).toBe(true);
    expect(esLimitePorNumero('WhatsApp 401: "Invalid api token."')).toBe(false);
  });
});

describe("nuevoDesdeRespuesta / sesionVigente", () => {
  it("takes what came after the agent's last reply", () => {
    const turnos = [
      { autor: "cliente" as const, texto: "Hola" },
      { autor: "agente" as const, texto: "Buenos días" },
      { autor: "equipo" as const, texto: "Ya va saliendo" },
      { autor: "cliente" as const, texto: "Un café" },
      { autor: "cliente" as const, texto: "porfa" },
    ];
    expect(nuevoDesdeRespuesta(turnos)).toEqual({ cliente: "Un café\nporfa", equipo: ["Ya va saliendo"] });
    expect(nuevoDesdeRespuesta([{ autor: "cliente" as const, texto: "Hola" }])).toEqual({ cliente: "Hola", equipo: [] });
  });
  it("reuses a session only within the hour", () => {
    const ahora = new Date("2026-11-16T10:00:00-05:00");
    expect(sesionVigente(new Date("2026-11-16T09:30:00-05:00"), ahora)).toBe(true);
    expect(sesionVigente(new Date("2026-11-16T08:30:00-05:00"), ahora)).toBe(false);
    expect(sesionVigente(null, ahora)).toBe(false);
  });
});
