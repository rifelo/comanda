import { beforeAll, describe, expect, it } from "vitest";
import {
  decidirVinculo,
  enlaceVincular,
  firmarTokenVincular,
  leerTokenVincular,
  normalizarTelefono,
  textoMiPayoParaAgente,
  VIGENCIA_VINCULAR_MS,
  type ResumenMiPayo,
} from "./telefono";

const ORG = "b069847f-0000-4000-8000-000000000001";
const T0 = Date.UTC(2026, 10, 16, 15, 0);

beforeAll(() => {
  process.env.BETTER_AUTH_SECRET = "secreto-de-prueba";
});

describe("normalizarTelefono", () => {
  it("deja los dígitos E.164 sin +", () => {
    expect(normalizarTelefono("+57 322 305 5222")).toBe("573223055222");
    expect(normalizarTelefono("573223055222")).toBe("573223055222");
  });
  it("le pone el 57 a un celular colombiano de 10 dígitos", () => {
    expect(normalizarTelefono("322 305 5222")).toBe("573223055222");
  });
  it("rechaza lo que no es un teléfono", () => {
    expect(normalizarTelefono("CO.123abc")).toBeNull();
    expect(normalizarTelefono("123")).toBeNull();
    expect(normalizarTelefono(null)).toBeNull();
  });
});

describe("decidirVinculo", () => {
  const base = { clienteId: "a", telefono: "573001112233" };
  it("vincula cuando el @ no tiene número y nadie más lo tiene", () => {
    expect(decidirVinculo({ ...base, telefonoActual: null, duenoDelTelefono: null })).toEqual({ accion: "vincular" });
  });
  it("no hace nada si ya es su número", () => {
    expect(decidirVinculo({ ...base, telefonoActual: "573001112233", duenoDelTelefono: "a" })).toEqual({ accion: "ya" });
  });
  it("nunca pisa un número distinto", () => {
    expect(decidirVinculo({ ...base, telefonoActual: "573009998877", duenoDelTelefono: null })).toEqual({ accion: "omitir", motivo: "otro_telefono" });
  });
  it("con reemplazar (teléfono verificado) sí lo cambia", () => {
    expect(decidirVinculo({ ...base, telefonoActual: "573009998877", duenoDelTelefono: null, reemplazar: true })).toEqual({ accion: "vincular" });
  });
  it("nunca le quita el número a otro @, ni reemplazando", () => {
    expect(decidirVinculo({ ...base, telefonoActual: null, duenoDelTelefono: "b" })).toEqual({ accion: "omitir", motivo: "telefono_de_otro" });
    expect(decidirVinculo({ ...base, telefonoActual: "573009998877", duenoDelTelefono: "b", reemplazar: true })).toEqual({ accion: "omitir", motivo: "telefono_de_otro" });
  });
});

describe("token de vincular", () => {
  it("firma y lee org + teléfono", () => {
    const t = firmarTokenVincular(ORG, "+57 322 305 5222", T0);
    const r = leerTokenVincular(t, T0 + 1000);
    expect(r).toEqual({ ok: true, token: { orgId: ORG, telefono: "573223055222", expira: expect.any(Number) } });
    if (r.ok) expect(Math.abs(r.token.expira - (T0 + VIGENCIA_VINCULAR_MS))).toBeLessThan(1000);
  });
  it("vence a las 24 h", () => {
    const t = firmarTokenVincular(ORG, "573223055222", T0);
    expect(leerTokenVincular(t, T0 + VIGENCIA_VINCULAR_MS - 5000).ok).toBe(true);
    expect(leerTokenVincular(t, T0 + VIGENCIA_VINCULAR_MS + 1000)).toEqual({ ok: false, motivo: "vencido" });
  });
  it("rechaza un token alterado o vacío", () => {
    const t = firmarTokenVincular(ORG, "573223055222", T0);
    expect(leerTokenVincular(t.replace("573223055222", "573001112233"), T0)).toEqual({ ok: false, motivo: "invalido" });
    expect(leerTokenVincular(`${t.slice(0, -2)}xx`, T0)).toEqual({ ok: false, motivo: "invalido" });
    expect(leerTokenVincular("", T0)).toEqual({ ok: false, motivo: "invalido" });
    expect(leerTokenVincular(null, T0)).toEqual({ ok: false, motivo: "invalido" });
  });
  it("con otro secreto no vale", () => {
    const t = firmarTokenVincular(ORG, "573223055222", T0);
    process.env.BETTER_AUTH_SECRET = "otro";
    try {
      expect(leerTokenVincular(t, T0).ok).toBe(false);
    } finally {
      process.env.BETTER_AUTH_SECRET = "secreto-de-prueba";
    }
  });
  it("el enlace va a cafepayo.com con el token", () => {
    const url = new URL(enlaceVincular(ORG, "573223055222", T0));
    expect(url.origin).toBe("https://cafepayo.com");
    expect(url.pathname).toBe("/menu/puntos/vincular");
    expect(leerTokenVincular(url.searchParams.get("t"), T0).ok).toBe(true);
  });
});

describe("textoMiPayoParaAgente", () => {
  const r: ResumenMiPayo = {
    instagram: "valen.c",
    puntos: 71,
    siguiente: { titulo: "La que quieras va por nosotros", puntos: 100, faltan: 29 },
    canjeables: [{ titulo: "Un clásico por nosotros", puntos: 50, detalle: "Tinto, café con leche, espresso o aromática" }],
    ultimas: [
      { nombre: "Latte frío", cuando: "Hoy · 8:42 a. m." },
      { nombre: "Tinto", cuando: "Ayer · 7:10 a. m." },
    ],
    totalBebidas: 23,
    racha: 2,
  };
  it("resume puntos, premios, bebidas y racha en pocas líneas", () => {
    const t = textoMiPayoParaAgente(r);
    expect(t.split("\n").length).toBeLessThanOrEqual(8);
    expect(t).toContain("@valen.c: 71 puntos");
    expect(t).toContain("Ya puede canjear: «Un clásico por nosotros»");
    expect(t).toContain("Le faltan 29 para «La que quieras va por nosotros»");
    expect(t).toContain("Bebidas con puntos: 23; racha de 2 días seguidos");
    expect(t).toContain("Latte frío (Hoy · 8:42 a. m.), Tinto (Ayer · 7:10 a. m.)");
  });
  it("sin premios ni historia queda corto", () => {
    const t = textoMiPayoParaAgente({ ...r, puntos: 1, canjeables: [], siguiente: { titulo: "Un clásico por nosotros", puntos: 50, faltan: 49 }, ultimas: [], totalBebidas: 0, racha: 0 });
    expect(t).toBe("Mi Pa'Yo de @valen.c: 1 punto.\nLe faltan 49 para «Un clásico por nosotros» (50 pts).\nBebidas con puntos: 0.");
  });
  it("sin @ vinculado pide mandar el enlace", () => {
    expect(textoMiPayoParaAgente(null)).toMatch(/no está vinculado/);
  });
});
