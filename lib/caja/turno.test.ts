import { describe, expect, it } from "vitest";
import { elegirTurnoCaja } from "./turno";

// Earliest start first, as listInstancesForCaja returns them.
const matutino = { id: "mat", status: "open" as const };
const noche = { id: "noc", status: "open" as const };
const limpieza = { id: "lim", status: "open" as const };
const dia = [matutino, noche, limpieza];

describe("elegirTurnoCaja", () => {
  it("uses the person's turno when given (the Matutino barista at 13:00)", () => {
    expect(elegirTurnoCaja(dia, {}, "mat")).toBe("mat");
  });

  it("without it, guesses the open turno that started last — the bug the team app avoids", () => {
    expect(elegirTurnoCaja(dia, {})).toBe("lim");
  });

  it("ignores a preferId that is not one of today's turnos", () => {
    expect(elegirTurnoCaja(dia, {}, "ayer")).toBe("lim");
  });

  it("keeps the person's turno even when its arqueo is already sent", () => {
    expect(elegirTurnoCaja(dia, { mat: { status: "pendiente" } }, "mat")).toBe("mat");
  });

  it("skips turnos with a live cierre, but not rejected ones", () => {
    const closed = [matutino, { ...noche, status: "closed" as const }];
    expect(elegirTurnoCaja(closed, { mat: { status: "pendiente" } })).toBe("noc");
    expect(elegirTurnoCaja(closed, { mat: { status: "rechazado" } })).toBe("mat");
  });

  it("falls back to the last turno, and null on an empty day", () => {
    expect(elegirTurnoCaja([matutino], { mat: { status: "aprobado" } })).toBe("mat");
    expect(elegirTurnoCaja([], {})).toBeNull();
  });
});
