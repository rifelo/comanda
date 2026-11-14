import { describe, expect, it } from "vitest";
import { coleccion, insignias, nuevasInsignias, podiosDe, rachaDiasActual, rachaDiasMasLarga, type BebidaCarta } from "./coleccion";
import type { Escaneo } from "./mi-payo";

const CARTA: BebidaCarta[] = [
  { nombre: "Cappuccino", grupo: "Calientes" },
  { nombre: "Tinto", grupo: "Calientes" },
  { nombre: "Latte frío de arándanos", grupo: "Frías" },
  { nombre: "Café dalgona", grupo: "Frías" },
  { nombre: "Jugo de mora", grupo: "Jugos" },
];
/** One scan of `n` × drink at a Bogotá hour on a given day of November 2026. */
const e = (nombre: string, n = 1, dia = 10, h = 15): Escaneo => ({
  at: new Date(Date.UTC(2026, 10, dia, h + 5)).toISOString(),
  puntos: 8 * n,
  items: [{ nombre, qty: n, valor: 8000 * n, tipo: nombre === "Croissant" ? "comida" : "frio" }],
});
// The owner's example: 3 cappuccinos, 2 blueberry lattes, 2 dalgonas = 7.
const EJEMPLO = [e("Cappuccino", 3), e("Latte frío de arándanos", 2), e("Café dalgona", 2)];

describe("coleccion", () => {
  it("cuenta 7 bebidas y 3 de 5 descubiertas, por grupo", () => {
    const c = coleccion(EJEMPLO, CARTA);
    expect(c.bebidas).toBe(7);
    expect(c.descubiertas).toBe(3);
    expect(c.carta).toBe(5);
    const cal = c.grupos.find((g) => g.grupo === "Calientes")!;
    expect(cal.cartas).toEqual([{ nombre: "Cappuccino", veces: 3 }, { nombre: "Tinto", veces: 0 }]);
    expect(c.grupos.find((g) => g.grupo === "Frías")!.descubiertas).toBe(2);
  });
  it("las bebidas que ya no están en la carta van a «pasadas»; botellas y comida no cuentan", () => {
    const c = coleccion([...EJEMPLO, e("Latte de temporada"), e("Coca-Cola"), e("Croissant")], CARTA, ["Coca-Cola"]);
    expect(c.pasadas).toEqual([{ nombre: "Latte de temporada", veces: 1 }]);
    expect(c.bebidas).toBe(8);
  });
});

describe("insignias", () => {
  it("con el ejemplo: primer sorbo ganado, explorador 3 de 5", () => {
    const ins = insignias(EJEMPLO, CARTA);
    expect(ins.find((i) => i.id === "primer-sorbo")?.ganada).toBe(true);
    const exp = ins.find((i) => i.id === "explorador")!;
    expect(exp.ganada).toBe(false);
    expect(exp.progreso).toEqual({ actual: 3, meta: 5 });
    expect(ins[0].ganada).toBe(true); // ganadas primero
  });
  it("del madrugón: 5 bebidas antes de las 9", () => {
    const temprano = [e("Tinto", 3, 3, 7), e("Tinto", 2, 4, 8)];
    expect(insignias(temprano, CARTA).find((i) => i.id === "madrugon")?.ganada).toBe(true);
    expect(insignias([e("Tinto", 5, 3, 9)], CARTA).find((i) => i.id === "madrugon")?.ganada).toBe(false);
  });
  it("fiel lleva el nombre de la bebida", () => {
    const f = insignias([e("Cappuccino", 5)], CARTA).find((i) => i.id === "fiel")!;
    expect(f.ganada).toBe(true);
    expect(f.nombre).toBe("Fiel al Cappuccino");
  });
  it("cliente 10 sube de nivel y muestra el siguiente", () => {
    const c = insignias([e("Tinto", 12)], CARTA).find((i) => i.id === "cliente")!;
    expect(c).toMatchObject({ ganada: true, nombre: "Cliente 10", progreso: { actual: 12, meta: 25 } });
  });
  it("todos los jugos con un solo jugo en la carta", () => {
    expect(insignias([e("Jugo de mora")], CARTA).find((i) => i.id === "todos-jugos")?.ganada).toBe(true);
  });
  it("top del mes con un podio terminado", () => {
    expect(insignias(EJEMPLO, CARTA, [{ mes: "octubre 2026", puesto: 2 }]).find((i) => i.id === "top-mes")?.ganada).toBe(true);
  });
  it("nuevasInsignias: lo ganado con el último escaneo, incluido un nivel nuevo", () => {
    const antes = insignias([e("Tinto", 9)], CARTA);
    const ahora = insignias([e("Tinto", 9), e("Tinto")], CARTA);
    expect(nuevasInsignias(antes, ahora)).toContainEqual({ id: "cliente", nombre: "Cliente 10" });
    expect(nuevasInsignias(ahora, ahora)).toEqual([]);
  });
});

describe("racha diaria", () => {
  const dias = [e("Tinto", 1, 10), e("Tinto", 1, 11), e("Tinto", 1, 12), e("Tinto", 1, 14)];
  it("la más larga cuenta días seguidos (hora de Bogotá)", () => {
    expect(rachaDiasMasLarga(dias)).toBe(3);
    expect(insignias(dias, CARTA).find((i) => i.id === "racha-dias")).toMatchObject({ ganada: true, nombre: "Racha de 3 días", progreso: { actual: 3, meta: 5 } });
  });
  it("la actual sigue viva si ayer hubo café", () => {
    expect(rachaDiasActual(dias, new Date(Date.UTC(2026, 10, 15, 17)))).toBe(1); // 15-nov: ayer (14) sí
    expect(rachaDiasActual(dias, new Date(Date.UTC(2026, 10, 16, 17)))).toBe(0); // 16-nov: ayer no
    expect(rachaDiasActual(dias, new Date(Date.UTC(2026, 10, 12, 20)))).toBe(3);
  });
  it("una compra a las 11 p. m. y otra a la 1 a. m. son días distintos", () => {
    expect(rachaDiasMasLarga([e("Tinto", 1, 10, 23), e("Tinto", 1, 11, 1)])).toBe(2);
  });
});

describe("podiosDe", () => {
  const qrs = [
    { clienteId: "a", instagram: "ana", puntos: 50, at: "2026-10-05T15:00:00Z" },
    { clienteId: "b", instagram: "bea", puntos: 30, at: "2026-10-06T15:00:00Z" },
    { clienteId: "c", instagram: "caro", puntos: 90, at: "2026-10-07T15:00:00Z" },
    { clienteId: "b", instagram: "bea", puntos: 99, at: "2026-11-02T15:00:00Z" }, // mes en curso: no cuenta
  ];
  it("puesto en cada mes terminado", () => {
    expect(podiosDe(qrs, "b", new Date("2026-11-14T12:00:00Z"))).toEqual([{ mes: "octubre 2026", puesto: 3 }]);
    expect(podiosDe(qrs, "c", new Date("2026-11-14T12:00:00Z"))).toEqual([{ mes: "octubre 2026", puesto: 1 }]);
  });
});
