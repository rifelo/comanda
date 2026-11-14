import { describe, expect, it } from "vitest";
import { bogota, desdeDe, diaCorto, enmascarar, hora, inicio, insights, pesosCortos, puestoDe, rachaActual, rachaMasLarga, ranking, type Escaneo, type FilaRanking } from "./mi-payo";

// Sunday 8 nov 2026, 3 p. m. in Bogotá.
const AHORA = new Date("2026-11-08T20:00:00Z");
const cup = (at: string, nombre: string, valor: number, tipo: "caliente" | "frio" | "comida" = "caliente"): Escaneo => ({
  at,
  puntos: Math.floor(valor / 1000),
  items: [{ nombre, qty: 1, valor, tipo }],
});

describe("Bogotá clock", () => {
  it("is UTC−5 and weeks start on Monday", () => {
    const b = bogota("2026-11-09T04:30:00Z"); // Sunday 8 nov, 11:30 p. m. there
    expect([b.d, b.h, b.dow]).toEqual([8, 23, 6]);
    expect(hora("2026-11-08T13:42:00Z")).toBe("8:42 a. m.");
    expect(hora("2026-11-08T17:05:00Z")).toBe("12:05 p. m.");
  });
  it("says today, yesterday or the short date", () => {
    expect(diaCorto("2026-11-08T13:00:00Z", AHORA)).toBe("Hoy");
    expect(diaCorto("2026-11-07T13:00:00Z", AHORA)).toBe("Ayer");
    expect(diaCorto("2026-11-05T14:00:00Z", AHORA)).toBe("Jue 5 nov");
  });
  it("periods start at Bogotá midnight", () => {
    expect(desdeDe("semana", AHORA)?.toISOString()).toBe("2026-11-02T05:00:00.000Z");
    expect(desdeDe("mes", AHORA)?.toISOString()).toBe("2026-11-01T05:00:00.000Z");
    expect(desdeDe("6m", AHORA)?.toISOString()).toBe("2026-06-01T05:00:00.000Z");
    expect(desdeDe("todo", AHORA)).toBeNull();
  });
});

describe("streaks", () => {
  const es = [cup("2026-10-13T14:00:00Z", "Latte", 8000), cup("2026-10-20T14:00:00Z", "Latte", 8000), cup("2026-10-28T14:00:00Z", "Latte", 8000), cup("2026-11-03T14:00:00Z", "Latte", 8000)];
  it("counts consecutive weeks; this week is still alive when last week had a visit", () => {
    expect(rachaMasLarga(es)).toBe(4);
    expect(rachaActual(es, AHORA)).toBe(4);
    expect(rachaActual(es, new Date("2026-11-20T20:00:00Z"))).toBe(0);
  });
});

describe("inicio", () => {
  it("totals, favourite and the last three scans, food left out of the drinks", () => {
    const es = [
      cup("2026-10-20T14:00:00Z", "Cappuccino", 7000),
      cup("2026-11-02T14:00:00Z", "Cappuccino", 7000),
      cup("2026-11-07T21:15:00Z", "Latte frío de arándanos", 12000, "frio"),
      { at: "2026-11-08T13:42:00Z", puntos: 12, items: [{ nombre: "Cappuccino", qty: 1, valor: 7000, tipo: "caliente" as const }, { nombre: "Brownie", qty: 1, valor: 5000, tipo: "comida" as const }] },
    ];
    const r = inicio(es, AHORA);
    expect(r.bebidas).toBe(4);
    expect(r.esteMes).toBe(3);
    expect(r.favorito).toEqual({ nombre: "Cappuccino", veces: 3, pct: 75 });
    expect(r.ultimos[0]).toEqual({ nombre: "Cappuccino", cuando: "Hoy · 8:42 a. m.", valor: "$12.000", puntos: 12 });
    expect(r.ultimos[1].cuando).toBe("Ayer · 4:15 p. m.");
    expect(r.ultimos).toHaveLength(3);
  });
});

describe("insights", () => {
  const es = [
    cup("2026-09-10T13:00:00Z", "Cappuccino", 7000),
    cup("2026-10-06T13:30:00Z", "Cappuccino", 7000),
    cup("2026-10-13T14:00:00Z", "Cappuccino", 7000),
    cup("2026-10-16T21:00:00Z", "Café dalgona", 11000, "frio"),
    cup("2026-11-02T13:00:00Z", "Cappuccino", 7000),
    cup("2026-11-03T13:10:00Z", "Latte", 8000),
  ];
  it("whole history", () => {
    const r = insights(es, "todo", AHORA);
    expect(r.bebidas).toBe(6);
    expect(r.gastado).toBe(47000);
    expect(r.distintas).toBe(3);
    expect(r.top[0]).toEqual({ nombre: "Cappuccino", veces: 4, pct: 67 });
    expect(r.meses.map((m) => m.v)).toEqual([0, 0, 0, 1, 3, 2]);
    expect(r.meses[5]).toMatchObject({ label: "Nov", actual: true });
    expect(r.mejorMes).toEqual({ nombre: "octubre", v: 3 });
    expect(r.horaPico).toBe("8 a 10 a. m.");
    expect(r.pctManana).toBe(83);
    expect([r.calientes, r.frias, r.favFria]).toEqual([5, 1, "Café dalgona"]);
    expect(r.diaFavorito).toBe("martes");
    expect(r.primera).toEqual({ nombre: "Cappuccino", fecha: "10 de septiembre" });
    expect(r.logros.filter((l) => l.hecho).map((l) => l.label)).toEqual(["Del madrugón", "Primera bebida", "Probaste 3 distintas"]);
    expect(r.logros.filter((l) => !l.hecho).map((l) => l.label)).toEqual(["10 bebidas · faltan 4", "Prueba 6 bebidas distintas"]);
  });
  it("this month only; month bars still show six months", () => {
    const r = insights(es, "mes", AHORA);
    expect(r.bebidas).toBe(2);
    expect(r.meses.map((m) => m.v)).toEqual([0, 0, 0, 1, 3, 2]);
  });
  it("empty history", () => {
    const r = insights([], "todo", AHORA);
    expect([r.bebidas, r.horaPico, r.diaFavorito, r.mejorMes, r.primera]).toEqual([0, null, null, null, null]);
  });
});

describe("ranking", () => {
  const filas: FilaRanking[] = [
    { clienteId: "a", instagram: "liseeeeeeeth", puntos: 37, bebidas: 6 },
    { clienteId: "b", instagram: "karen_diazt", puntos: 33, bebidas: 5 },
    { clienteId: "c", instagram: "soyesgode", puntos: 29, bebidas: 4 },
    { clienteId: "d", instagram: "srta.jamie", puntos: 28, bebidas: 4 },
    { clienteId: "e", instagram: "elsa_yuliana_pa", puntos: 24, bebidas: 3 },
    { clienteId: "f", instagram: "macrx_16", puntos: 21, bebidas: 3 },
    { clienteId: "g", instagram: "santiago", puntos: 18, bebidas: 2 },
    { clienteId: "h", instagram: "zai", puntos: 17, bebidas: 2 },
    { clienteId: "i", instagram: "nadie", puntos: 0, bebidas: 0 },
  ];
  it("masks everyone but me", () => {
    expect(enmascarar("liseeeeeeeth")).toBe("@lis•••th");
    expect(enmascarar("zai")).toBe("@z•••");
    expect(enmascarar("srta.j")).toBe("@sr•••j");
    const r = ranking(filas, "b");
    expect(r.podio.map((p) => p.handle)).toEqual(["@lis•••th", "@karen_diazt", "@soy•••de"]);
    expect(r.yo).toEqual({ pos: 2, puntos: 33, faltan: 5 });
  });
  it("shows me after rows 4–6 when I'm further down; zero points don't rank", () => {
    const r = ranking(filas, "h");
    expect(r.filas.map((p) => p.pos)).toEqual([4, 5, 6, 8]);
    expect(r.filas[3]).toMatchObject({ handle: "@zai", yo: true });
    expect(r.yo).toEqual({ pos: 8, puntos: 17, faltan: 2 });
    expect(ranking(filas, "i").yo).toBeNull();
    expect(puestoDe(filas, "e")).toBe(5);
    expect(ranking(filas, "a").yo?.faltan).toBeNull();
  });
  it("short money", () => {
    expect(pesosCortos(612000)).toBe("$612K");
    expect(pesosCortos(7000)).toBe("$7.000");
    expect(pesosCortos(1250000)).toBe("$1,3M");
  });
});
