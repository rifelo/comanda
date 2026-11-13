import { describe, expect, it } from "vitest";
import { aplicarDescuentos, etiquetaDescuento, vigentes, type LineaDescuento } from "./descuentos";

const tinto: LineaDescuento = { kind: "item", productoId: "t", qty: 20, unit: 3000, base: 3000 };
const latte: LineaDescuento = { kind: "item", productoId: "l", qty: 2, unit: 8500, base: 8500 };

describe("aplicarDescuentos", () => {
  it("special price applies only to its product", () => {
    const r = aplicarDescuentos([tinto, latte], [{ tipo: "precio", productoId: "t", precio: 2000 }]);
    expect(r.units).toEqual([2000, 8500]);
    expect(r.subtotal).toBe(77000);
    expect(r.total).toBe(57000);
    expect(r.descuento).toBe(20000);
  });
  it("option extras stay on top of the special price", () => {
    const conExtra = { ...tinto, qty: 1, unit: 4000 };
    expect(aplicarDescuentos([conExtra], [{ tipo: "precio", productoId: "t", precio: 2000 }]).units).toEqual([3000]);
  });
  it("percentage rounds each unit to hundreds and stacks after the special price", () => {
    const r = aplicarDescuentos([tinto, latte], [
      { tipo: "precio", productoId: "t", precio: 2000 },
      { tipo: "porcentaje", porcentaje: 15 },
    ]);
    expect(r.units).toEqual([1700, 7200]);
  });
  it("a higher special price never raises the price", () => {
    expect(aplicarDescuentos([tinto], [{ tipo: "precio", productoId: "t", precio: 5000 }]).units).toEqual([3000]);
  });
  it("latest rule per product wins", () => {
    expect(vigentes([
      { tipo: "precio", productoId: "t", precio: 2000 },
      { tipo: "precio", productoId: "t", precio: 2500 },
    ])).toEqual([{ tipo: "precio", productoId: "t", precio: 2500 }]);
  });
  it("combos and unknown products only take the percentage", () => {
    const combo: LineaDescuento = { kind: "combo", productoId: null, qty: 1, unit: 10000, base: null };
    expect(aplicarDescuentos([combo], [{ tipo: "precio", productoId: "t", precio: 0 }, { tipo: "porcentaje", porcentaje: 10 }]).units).toEqual([9000]);
  });
});

describe("etiquetaDescuento", () => {
  it("reads like the owner says it", () => {
    expect(etiquetaDescuento({ tipo: "precio", producto_nombre: "Tinto", precio_cop: 2000 })).toBe("Tinto a $2.000 c/u");
    expect(etiquetaDescuento({ tipo: "porcentaje", porcentaje: "10.00" })).toBe("10 % a todo el pedido");
  });
});
