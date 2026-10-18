import { describe, expect, it } from "vitest";
import { clasificar, errorSugerencia, yaSugerida } from "./sugerencias";

const items = [
  { id: "leche", name: "Leche entera Gran Vía (bolsa 900 ml)", ubicacion: "Nevera" },
  { id: "vaso", name: "Vaso Darnel PET 12 oz", ubicacion: "Bodega" },
  { id: "pitillo", name: "Pitillo", ubicacion: null },
];

describe("clasificar", () => {
  it("the same name already in this section: nothing to suggest", () => {
    expect(clasificar("pitillos", "Barra", [{ ...items[2], ubicacion: "Barra" }])).toMatchObject({ yaAqui: true });
  });
  it("the same name elsewhere: it goes in this section", () => {
    const r = clasificar("Pitillo", "Barra", items);
    expect(r.igual?.id).toBe("pitillo");
    expect(r.yaAqui).toBe(false);
  });
  it("a new name lists the closest items first", () => {
    const r = clasificar("vasos pet", "Barra", items);
    expect(r.igual).toBeNull();
    expect(r.parecidos.map((i) => i.id)).toEqual(["vaso"]);
  });
});

describe("errorSugerencia", () => {
  it("needs a section and what", () => {
    expect(errorSugerencia({ zona: null, tipo: "nuevo", nombre: "Jabón" })).toMatch(/sección/);
    expect(errorSugerencia({ zona: "Barra", tipo: "nuevo", nombre: " " })).toMatch(/falta/);
    expect(errorSugerencia({ zona: "Barra", tipo: "ubicacion" })).toMatch(/ítem/);
    expect(errorSugerencia({ zona: "Aseo", tipo: "nuevo", nombre: "Jabón de loza" })).toBeNull();
  });
});

describe("yaSugerida", () => {
  const abiertas = [{ zona: "Aseo", tipo: "nuevo", ingrediente_id: null, nombre: "Jabón de loza" }, { zona: "Barra", tipo: "ubicacion", ingrediente_id: "pitillo", nombre: null }];
  it("spots the same open suggestion", () => {
    expect(yaSugerida({ zona: "Aseo", tipo: "nuevo", nombre: "jabon loza" }, abiertas)).toBe(true);
    expect(yaSugerida({ zona: "Barra", tipo: "ubicacion", ingredienteId: "pitillo" }, abiertas)).toBe(true);
    expect(yaSugerida({ zona: "Bodega", tipo: "nuevo", nombre: "Jabón de loza" }, abiertas)).toBe(false);
  });
});
