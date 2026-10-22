import { describe, it, expect } from "vitest";
import { diaIdx, diasLabel, normDias, tareaToca, tareasDelDia } from "@/lib/turno/dias-tarea";

const SOLO_LUNES = [true, false, false, false, false, false, false];

describe("diaIdx", () => {
  it("is Monday-based", () => {
    expect(diaIdx("2026-10-19")).toBe(0); // lunes
    expect(diaIdx("2026-10-25")).toBe(6); // domingo
  });
});

describe("normDias / tareaToca", () => {
  it("treats null, bad shapes, all-on and all-off as every day", () => {
    expect(normDias(null)).toBeNull();
    expect(normDias([true, true])).toBeNull();
    expect(normDias(Array(7).fill(true))).toBeNull();
    expect(normDias(Array(7).fill(false))).toBeNull();
    expect(tareaToca(undefined, "2026-10-21")).toBe(true);
  });
  it("applies a weekly task only on its day", () => {
    expect(tareaToca(SOLO_LUNES, "2026-10-19")).toBe(true);
    expect(tareaToca(SOLO_LUNES, "2026-10-21")).toBe(false);
  });
});

describe("tareasDelDia", () => {
  const tasks = [
    { id: "a", dias: null },
    { id: "b", dias: SOLO_LUNES },
  ];
  it("drops a task off its day", () => {
    expect(tareasDelDia(tasks, "2026-10-21").map((t) => t.id)).toEqual(["a"]);
    expect(tareasDelDia(tasks, "2026-10-19").map((t) => t.id)).toEqual(["a", "b"]);
  });
  it("keeps a task done that day even off its days (Set or map)", () => {
    expect(tareasDelDia(tasks, "2026-10-21", new Set(["b"])).map((t) => t.id)).toEqual(["a", "b"]);
    expect(tareasDelDia(tasks, "2026-10-21", { b: { id: "x" } }).map((t) => t.id)).toEqual(["a", "b"]);
  });
});

describe("diasLabel", () => {
  it("names the days or returns null for every day", () => {
    expect(diasLabel(SOLO_LUNES)).toBe("lun");
    expect(diasLabel([false, false, false, true, false, false, true])).toBe("jue · dom");
    expect(diasLabel(null)).toBeNull();
  });
});
