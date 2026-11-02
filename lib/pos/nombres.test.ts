import { describe, expect, it } from "vitest";
import { partesCoincidencia, rankNombres, sugerirNombres } from "./nombres";

describe("rankNombres", () => {
  it("counts each name once per order, keeps the usual spelling", () => {
    const r = rankNombres([
      { nombres: ["Sebastián", "sebastian", "Laura"] },
      { nombres: ["Sebastián"] },
      { nombres: ["Sebastian", "", null, "L"] },
      { nombres: ["Laura"] },
      { nombres: ["Doc. Bibiana"] },
    ]);
    expect(r).toEqual([
      { nombre: "Sebastián", veces: 3 },
      { nombre: "Laura", veces: 2 },
      { nombre: "Doc. Bibiana", veces: 1 },
    ]);
  });
});

describe("sugerirNombres", () => {
  const ns = [
    { nombre: "Sebastián", veces: 35 }, { nombre: "Doc. Bibiana", veces: 33 }, { nombre: "Alejandra", veces: 30 },
    { nombre: "Alejandro", veces: 4 }, { nombre: "Alexis", veces: 1 }, { nombre: "María José", veces: 9 },
  ];
  it("prefix of the name first, then by frequency", () => {
    expect(sugerirNombres("ale", ns).map((n) => n.nombre)).toEqual(["Alejandra", "Alejandro", "Alexis"]);
  });
  it("matches any word and ignores accents", () => {
    expect(sugerirNombres("bib", ns).map((n) => n.nombre)).toEqual(["Doc. Bibiana"]);
    expect(sugerirNombres("jose", ns).map((n) => n.nombre)).toEqual(["María José"]);
    expect(sugerirNombres("seba", ns).map((n) => n.nombre)).toEqual(["Sebastián"]);
  });
  it("leaves out names already on the order and the exact text", () => {
    expect(sugerirNombres("ale", ns, { excluir: ["alejandra"] }).map((n) => n.nombre)).toEqual(["Alejandro", "Alexis"]);
    expect(sugerirNombres("alexis", ns)).toEqual([]);
  });
});

describe("partesCoincidencia", () => {
  it("splits around the typed part", () => {
    expect(partesCoincidencia("Alejandra", "ale")).toEqual(["", "Ale", "jandra"]);
    expect(partesCoincidencia("Doc. Bibiana", "bib")).toEqual(["Doc. ", "Bib", "iana"]);
    expect(partesCoincidencia("Sebastián", "")).toEqual(["Sebastián", "", ""]);
  });
});
