import { describe, expect, it } from "vitest";
import { atrasadas, estadoBase, estadoTurno, fechaLarga, fechaTitulo, porAtender, type PorAtenderInput } from "./hoy";

const fmt = (n: number) => `$${n}`;
const base: PorAtenderInput = {
  date: "2026-10-31",
  turnosPorRevisar: 0,
  arqueosPorAprobar: 0,
  base: { estado: "ok", turno: null },
  agotado: 0,
  bajo: 0,
  conteosPorAprobar: 0,
  costosPorRevisar: 0,
  sugerencias: 0,
  pedidosAbiertos: 0,
  pedidosViejos: 0,
  porCobrar: 0,
};

describe("fechaLarga / fechaTitulo", () => {
  it("formats without locale APIs", () => {
    expect(fechaLarga("2026-10-31")).toBe("sábado 31 de octubre");
    expect(fechaLarga("2026-01-05")).toBe("lunes 5 de enero");
    expect(fechaTitulo("2026-10-30")).toBe("Viernes 30 oct");
  });
});

describe("estadoTurno", () => {
  it("maps instance status and review", () => {
    expect(estadoTurno({ status: null, reviewedAt: null })).toBe("por_abrir");
    expect(estadoTurno({ status: "open", reviewedAt: null })).toBe("en_curso");
    expect(estadoTurno({ status: "closed", reviewedAt: null })).toBe("por_revisar");
    expect(estadoTurno({ status: "closed", reviewedAt: "2026-10-31T20:00:00Z" })).toBe("revisado");
  });
});

describe("atrasadas", () => {
  const tasks = [
    { id: "a", due_time: "06:30:00" },
    { id: "b", due_time: "09:00:00" },
    { id: "c", due_time: null },
    { id: "d", due_time: "12:00:00" },
  ];
  it("counts past-due tasks that are not done", () => {
    expect(atrasadas(tasks, new Set(), "09:30")).toBe(2);
    expect(atrasadas(tasks, new Set(["a"]), "09:30")).toBe(1);
    expect(atrasadas(tasks, new Set(), "06:00")).toBe(0);
  });
  it("a task due exactly now is not late yet", () => {
    expect(atrasadas(tasks, new Set(), "09:00")).toBe(1);
  });
});

describe("estadoBase", () => {
  it("reads the latest close", () => {
    expect(estadoBase(null)).toBeNull();
    expect(estadoBase({ base_validada_at: null, base_validada_ok: null })).toBe("por_validar");
    expect(estadoBase({ base_validada_at: "x", base_validada_ok: true })).toBe("ok");
    expect(estadoBase({ base_validada_at: "x", base_validada_ok: false })).toBe("no_cuadro");
  });
});

describe("porAtender", () => {
  it("is empty when everything is up to date", () => {
    expect(porAtender(base, fmt)).toEqual([]);
  });

  it("puts red items first", () => {
    const items = porAtender(
      { ...base, turnosPorRevisar: 1, agotado: 2, bajo: 1, base: { estado: "no_cuadro", turno: "Matutino" }, costosPorRevisar: 3 },
      fmt,
    );
    expect(items.map((i) => i.id)).toEqual(["base", "agotado", "turnos", "costos"]);
    expect(items[0].tone).toBe("late");
    expect(items[1].title).toBe("2 cosas se acabaron");
    expect(items[2].href).toBe("/hoy/2026-10-31/turnos");
  });

  it("only-low stock is neutral", () => {
    const [it0] = porAtender({ ...base, bajo: 3 }, fmt);
    expect(it0).toMatchObject({ id: "agotado", tone: "neutral", title: "3 se están acabando" });
  });

  it("splits old open orders from today's", () => {
    const items = porAtender({ ...base, pedidosAbiertos: 3, pedidosViejos: 1, porCobrar: 25000 }, fmt);
    expect(items.map((i) => [i.id, i.tone])).toEqual([
      ["pedidos-viejos", "late"],
      ["pedidos", "neutral"],
    ]);
    expect(items[1].title).toBe("2 pedidos abiertos");
    expect(items[1].sub).toBe("$25000 por cobrar");
  });

  it("singular labels", () => {
    const items = porAtender({ ...base, arqueosPorAprobar: 1, conteosPorAprobar: 1, sugerencias: 1, base: { estado: "por_validar", turno: "Noche" } }, fmt);
    expect(items.map((i) => i.title)).toEqual(["1 arqueo por aprobar", "Base por validar", "1 conteo por aprobar", "1 sugerencia del equipo"]);
  });
});
