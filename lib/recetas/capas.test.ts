import { describe, expect, it } from "vitest";
import { armarFicha, cuadreReceta, fichaATexto, parseFichaCapas, validarFichaCapas, type FichaCapas } from "./capas";

const ings = new Map([
  ["leche", { name: "Leche entera Gran Vía (bolsa 900 ml)", unit: "ml" }],
  ["hielo", { name: "Hielo", unit: "g" }],
  ["milo", { name: "Milo", unit: "g" }],
  ["vaso12", { name: "vaso darnel pet x 12Oz", unit: "und" }],
  ["pulpa", { name: "Pulpa de mora (bolsa 125 g)", unit: "und" }],
]);

const milo: FichaCapas = {
  capas: [
    { capa: "cierre", ops: ["tapar", "servir"], items: [{ texto: "Tapa plana + pitillo negro" }] },
    { capa: "vaso", ops: ["pegar"], items: [{ ing: "vaso12", qty: 1 }] },
    { capa: "hielo", ops: ["verter"], nota: "Cubos enteros", items: [{ ing: "hielo", qty: 110 }] },
    { capa: "cuerpo", ops: ["verter"], items: [{ ing: "leche", qty: 150 }] },
    { capa: "carga", ops: ["disolver"], items: [{ ing: "milo", qty: 30 }, { texto: "Agua caliente 30 ml", texto16: "40 ml" }] },
    { capa: "espuma", ops: ["batir"], items: [{ ing: "leche", qty: 20 }, { ing: "milo", qty: 8 }] },
  ],
  grupos: [],
};

describe("parseFichaCapas", () => {
  it("keeps the fixed order, drops unknown layers/ops and duplicates", () => {
    const f = parseFichaCapas({ capas: [...milo.capas, { capa: "hielo", ops: [], items: [] }, { capa: "xx", ops: [], items: [] }, { capa: "topping", ops: ["volar"], items: [{ texto: "Milo" }] }] })!;
    expect(f.capas.map((c) => c.capa)).toEqual(["vaso", "hielo", "cuerpo", "carga", "espuma", "topping", "cierre"]);
    expect(f.capas.find((c) => c.capa === "topping")!.ops).toEqual([]);
    expect(parseFichaCapas(null)).toBeNull();
    expect(parseFichaCapas({ capas: [] })).toBeNull();
  });
});

describe("validarFichaCapas", () => {
  it("accepts a contiguous group and rejects bad ones", () => {
    const jugo = parseFichaCapas({
      capas: [
        { capa: "base", ops: [], items: [{ texto: "Jarabe simple 20 ml" }] },
        { capa: "hielo", ops: [], items: [{ ing: "hielo", qty: 50 }] },
        { capa: "cuerpo", ops: [], items: [{ texto: "Agua 200 ml" }] },
        { capa: "carga", ops: [], items: [{ ing: "pulpa", qty: 1 }] },
      ],
      grupos: [{ desde: "base", hasta: "carga", op: "licuar", nota: "40 s" }],
    })!;
    expect(validarFichaCapas(jugo)).toBeNull();
    expect(validarFichaCapas({ ...jugo, grupos: [{ desde: "carga", hasta: "base", op: "licuar" }] })).toMatch(/posterior/);
    expect(validarFichaCapas({ ...jugo, grupos: [{ desde: "base", hasta: "hielo", op: "licuar" }, { desde: "hielo", hasta: "carga", op: "batir" }] })).toMatch(/se cruzan/);
    expect(validarFichaCapas({ ...jugo, grupos: [{ desde: "espuma", hasta: "cierre", op: "batir" }] })).toMatch(/al menos 2/);
    expect(validarFichaCapas({ capas: [{ capa: "vaso", ops: [], items: [] }], grupos: [] })).toMatch(/vacía/);
  });
});

describe("cuadreReceta", () => {
  it("adds each ingredient across layers and compares with the recipe", () => {
    const receta = new Map([["leche", 170], ["hielo", 110], ["milo", 45], ["vaso12", 1]]);
    expect(cuadreReceta(parseFichaCapas(milo)!, receta)).toEqual([{ ing: "milo", enCapas: 38, enReceta: 45 }]);
  });
});

describe("armarFicha", () => {
  it("numbers layers by their fixed position and fills the 16 oz column", () => {
    const tam16 = { factor: { leche: 1.33, hielo: 1.33, milo: 1.33 }, swap: { vaso12: "Vaso PET 16 oz" } };
    const b = armarFicha(parseFichaCapas(milo)!, ings, tam16, new Set(["leche"]));
    expect(b.map((x) => (x.tipo === "capa" ? x.capa.n : 0))).toEqual([1, 3, 4, 5, 6, 8]);
    const cuerpo = b[2].tipo === "capa" ? b[2].capa : null;
    expect(cuerpo?.lineas[0]).toEqual({ texto: "Leche entera Gran Vía", t12: "150 ml", t16: "200 ml (× 1,33)", sustituible: true });
    const vaso = b[0].tipo === "capa" ? b[0].capa : null;
    expect(vaso?.lineas[0].t16).toBe("Vaso PET 16 oz");
    const cierre = b[5].tipo === "capa" ? b[5].capa : null;
    expect(cierre?.ops).toEqual(["Tapar", "Servir"]);
    expect(armarFicha(parseFichaCapas(milo)!, ings, null)[1].tipo === "capa" && (armarFicha(parseFichaCapas(milo)!, ings, null)[1] as { capa: { lineas: { t16: string }[] } }).capa.lineas[0].t16).toBe("");
  });

  it("puts grouped layers in one block and writes a text fallback", () => {
    const f = parseFichaCapas({
      capas: [
        { capa: "vaso", ops: ["pegar"], items: [{ ing: "vaso12", qty: 1 }] },
        { capa: "base", ops: [], items: [{ texto: "Jarabe simple 20 ml" }] },
        { capa: "hielo", ops: [], items: [{ ing: "hielo", qty: 50 }] },
        { capa: "carga", ops: [], items: [{ ing: "pulpa", qty: 1 }] },
        { capa: "cierre", ops: ["tapar"], items: [] },
      ],
      grupos: [{ desde: "base", hasta: "carga", op: "licuar", nota: "40 s, sin trozos" }],
    })!;
    const b = armarFicha(f, ings, null);
    expect(b.map((x) => x.tipo)).toEqual(["capa", "grupo", "capa"]);
    expect(b[1].tipo === "grupo" && b[1].capas.map((c) => c.key)).toEqual(["base", "hielo", "carga"]);
    expect(fichaATexto(b).split("\n")).toEqual([
      "Vaso · Pegar · vaso darnel pet x 12Oz 1 und",
      "Licuar: Base dulce · Jarabe simple 20 ml | Hielo · Hielo 50 g | Carga · Pulpa de mora 1 und · 40 s, sin trozos",
      "Cierre · Tapar",
    ]);
  });
});
