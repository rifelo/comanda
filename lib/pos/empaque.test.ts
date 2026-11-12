import { describe, expect, it } from "vitest";
import { empaqueDePedido } from "./empaque";

const m = (o: Parameters<typeof empaqueDePedido>[0]) => Object.fromEntries(empaqueDePedido(o));

describe("empaqueDePedido", () => {
  it("takes nothing for orders at the café", () => {
    expect(m({ orderType: "aqui", bebidas: 4, comidas: 2 })).toEqual({});
  });
  it("follows the owner's table", () => {
    expect(m({ orderType: "llevar", bebidas: 1, comidas: 0 })).toEqual({});
    expect(m({ orderType: "llevar", bebidas: 2, comidas: 0 })).toEqual({ portavasos_2: 1, bolsa_mediana: 1 });
    expect(m({ orderType: "domicilio", bebidas: 3, comidas: 0 })).toEqual({ portavasos_4: 1, bolsa_grande: 1 });
    expect(m({ orderType: "domicilio", bebidas: 4, comidas: 0 })).toEqual({ portavasos_4: 1, bolsa_grande: 1 });
  });
  it("adds a greaseproof bag per food item", () => {
    expect(m({ orderType: "llevar", bebidas: 1, comidas: 2 })).toEqual({ bolsa_comida: 2 });
    expect(m({ orderType: "llevar", bebidas: 2, comidas: 1 })).toEqual({ portavasos_2: 1, bolsa_mediana: 1, bolsa_comida: 1 });
  });
  it("repeats the pattern for big orders", () => {
    expect(m({ orderType: "domicilio", bebidas: 5, comidas: 0 })).toEqual({ portavasos_4: 1, bolsa_grande: 1 });
    expect(m({ orderType: "domicilio", bebidas: 6, comidas: 0 })).toEqual({ portavasos_4: 1, bolsa_grande: 1, portavasos_2: 1, bolsa_mediana: 1 });
    expect(m({ orderType: "domicilio", bebidas: 7, comidas: 0 })).toEqual({ portavasos_4: 2, bolsa_grande: 2 });
  });
});
