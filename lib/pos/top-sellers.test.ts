import { describe, expect, it } from "vitest";
import { rankTopSellers } from "./top-sellers";

const names = new Map([
  ["p-tinto", "Tinto"],
  ["p-cappu", "Cappuccino"],
  ["p-agua", "Agua 600 ml"],
]);
const at = "2026-10-20T10:00:00Z";

describe("rankTopSellers", () => {
  it("orders products by units sold", () => {
    expect(
      rankTopSellers(
        [
          { productoId: "p-cappu", qty: 1, at },
          { productoId: "p-tinto", qty: 2, at },
          { productoId: "p-cappu", qty: 3, at },
          { productoId: "p-agua", qty: 1, at },
        ],
        names,
      ),
    ).toEqual(["p-cappu", "p-tinto", "p-agua"]);
  });

  it("skips combo lines and products no longer in the catalog", () => {
    expect(
      rankTopSellers(
        [
          { productoId: null, qty: 5, at },
          { productoId: "p-borrado", qty: 9, at },
          { productoId: "p-tinto", qty: 1, at },
        ],
        names,
      ),
    ).toEqual(["p-tinto"]);
  });

  it("breaks ties by the most recent sale, then by name", () => {
    expect(
      rankTopSellers(
        [
          { productoId: "p-tinto", qty: 2, at: "2026-10-20T08:00:00Z" },
          { productoId: "p-agua", qty: 2, at: "2026-10-21T08:00:00Z" },
          { productoId: "p-cappu", qty: 2, at: "2026-10-20T08:00:00Z" },
        ],
        names,
      ),
    ).toEqual(["p-agua", "p-cappu", "p-tinto"]);
  });

  it("caps the list", () => {
    const lines = [...names.keys()].map((productoId) => ({ productoId, qty: 1, at }));
    expect(rankTopSellers(lines, names, 2)).toHaveLength(2);
  });
});
