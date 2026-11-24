import { describe, expect, it } from "vitest";
import { enlacePedido, normalizarOrigen } from "./origenes";

describe("normalizarOrigen", () => {
  it("keeps a clean slug and cleans a messy one", () => {
    expect(normalizarOrigen("ese-salud-yopal")).toBe("ese-salud-yopal");
    expect(normalizarOrigen(" ESE Salud  Yopal/ ")).toBe("ese-salud-yopal");
    expect(normalizarOrigen("Clínica Ñ")).toBe("clinica-n");
  });
  it("refuses what has nothing usable and cuts the long ones", () => {
    expect(normalizarOrigen("")).toBeNull();
    expect(normalizarOrigen("///")).toBeNull();
    expect(normalizarOrigen(null)).toBeNull();
    expect(normalizarOrigen("a".repeat(60))).toHaveLength(40);
  });
});

describe("enlacePedido", () => {
  it("opens the café's WhatsApp with the place in the message", () => {
    const url = enlacePedido("ese-salud-yopal")!;
    expect(url.startsWith("https://wa.me/573001269607?text=")).toBe(true);
    expect(decodeURIComponent(url.split("text=")[1])).toBe("Hola, quiero pedir para la portería de ESE Salud Yopal");
  });
  it("gives nothing for a place without a printed piece", () => {
    expect(enlacePedido("otro-lugar")).toBeNull();
  });
});
