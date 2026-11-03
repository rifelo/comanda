import { describe, expect, it } from "vitest";
import { elegirTurnoCaja, esTurnoCorto } from "./turno";

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

describe("short task turnos don't hold the drawer", () => {
  const mat = { id: "mat", status: "open" as const, inicio: "06:00", fin: "13:30" };
  const basura = { id: "bas", status: "open" as const, inicio: "06:30", fin: "07:30" };
  const noche = { id: "noc", status: "open" as const, inicio: "12:30", fin: "20:00" };
  it("tells a task slot from a shift", () => {
    expect(esTurnoCorto(basura)).toBe(true);
    expect(esTurnoCorto({ inicio: "11:00", fin: "13:50" })).toBe(false);
    expect(esTurnoCorto({ inicio: "22:00", fin: "06:00" })).toBe(false);
    expect(esTurnoCorto({})).toBe(false);
  });
  it("«Sacar la basura» as the person's turno moves to the real one", () => {
    expect(elegirTurnoCaja([mat, basura, noche], {}, "bas")).toBe("noc");
    expect(elegirTurnoCaja([mat, basura, noche], {}, "mat")).toBe("mat");
    // A day with only task turnos still has somewhere to count.
    expect(elegirTurnoCaja([basura], {}, "bas")).toBe("bas");
  });
});
