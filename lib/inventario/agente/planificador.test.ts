import { describe, expect, it } from "vitest";
import { BAJA_ROTACION_DIAS, CONFIG_DEFAULT, desconfianza, diasEntre, lineaAplicaSola, planificar, rotacionDe, type Candidato } from "./planificador";

const base = (over: Partial<Candidato>): Candidato => ({
  ingredienteId: "x",
  name: "X",
  ubicacion: "Barra",
  stock: 10,
  stockMin: 0,
  costo: 100,
  vendido: 0,
  pedidos: 0,
  diasSinContar: 1,
  aviso: null,
  rotacion: "alta",
  masivo: false,
  puntoPedido: null,
  conProveedor: false,
  abierta: false,
  ...over,
});

describe("planificar", () => {
  it("verifies every high-rotation item sold yesterday, with no cap", () => {
    const cs = [base({ ingredienteId: "big", vendido: 100 }), base({ ingredienteId: "mid", vendido: 50 }), ...Array.from({ length: 10 }, (_, i) => base({ ingredienteId: `s${i}`, vendido: 1 }))];
    const plan = planificar(cs, CONFIG_DEFAULT, 0);
    expect(plan).toHaveLength(12);
    expect(plan[0].ingredienteId).toBe("big");
    expect(plan.every((t) => t.motivo === "vendido_ayer")).toBe(true);
    expect(planificar(cs, { ...CONFIG_DEFAULT, max: 3 }, 0)).toHaveLength(3);
  });

  it("verifies a low-rotation item sold yesterday at most once a week", () => {
    const cs = [
      base({ ingredienteId: "reciente", rotacion: "baja", vendido: 2, diasSinContar: 2 }),
      base({ ingredienteId: "viejo", rotacion: "baja", vendido: 2, diasSinContar: BAJA_ROTACION_DIAS }),
      base({ ingredienteId: "nunca", rotacion: "baja", vendido: 1, diasSinContar: null }),
      base({ ingredienteId: "alta", rotacion: "alta", vendido: 1, diasSinContar: 0 }),
    ];
    const ids = planificar(cs, { ...CONFIG_DEFAULT, reglas: { ...CONFIG_DEFAULT.reglas, sin_contar: false } }, 0).map((t) => t.ingredienteId).sort();
    expect(ids).toEqual(["alta", "nunca", "viejo"]);
  });

  it("bulk items: out of «vendido ayer», counted weekly; «antes de pedir» uses the PAR", () => {
    const cs = [
      base({ ingredienteId: "vasos", masivo: true, vendido: 30, diasSinContar: 3 }),
      base({ ingredienteId: "vasosViejo", masivo: true, vendido: 30, diasSinContar: 8 }),
      base({ ingredienteId: "leche", conProveedor: true, stock: 700, puntoPedido: 750, vendido: 0 }),
      base({ ingredienteId: "cafe", conProveedor: true, stock: 800, puntoPedido: 750, stockMin: 900, vendido: 0 }),
    ];
    const plan = planificar(cs, CONFIG_DEFAULT, 0);
    expect(plan.find((t) => t.ingredienteId === "vasos")).toBeUndefined();
    expect(plan.find((t) => t.ingredienteId === "vasosViejo")?.detalle).toContain("Compra masiva");
    expect(plan.find((t) => t.ingredienteId === "leche")?.motivo).toBe("antes_pedir");
    expect(plan.find((t) => t.ingredienteId === "cafe")).toBeUndefined();
  });

  it("an expired verification comes back first, whatever the rules", () => {
    const cs = [base({ ingredienteId: "olvidado", vencida: { desde: "2026-11-05", veces: 2 } }), base({ ingredienteId: "vendido", vendido: 5 })];
    const off = { ...CONFIG_DEFAULT, reglas: { vendido_ayer: true, aviso: false, antes_pedir: false, sin_contar: false } };
    const plan = planificar(cs, off, 0);
    expect(plan[0]).toMatchObject({ ingredienteId: "olvidado", motivo: "pendiente" });
    expect(plan[0].detalle).toBe("Venció sin contarse · se pidió el 05/11 · se venció 2 veces");
  });

  it("classifies rotation from selling days", () => {
    expect(rotacionDe(7, 14)).toBe("alta");
    expect(rotacionDe(6, 14)).toBe("baja");
    expect(rotacionDe(2, 2)).toBe("baja");
  });

  it("puts team warnings and reorder checks before sales", () => {
    const cs = [
      base({ ingredienteId: "v", vendido: 100, pedidos: 9 }),
      base({ ingredienteId: "a", stock: 10, stockMin: 2, aviso: { estado: "bajo", por: "Pipe", dias: 0 } }),
      base({ ingredienteId: "p", conProveedor: true, stockMin: 20, stock: 5 }),
    ];
    const plan = planificar(cs, CONFIG_DEFAULT, 0);
    expect(plan.map((t) => t.ingredienteId)).toEqual(["a", "p", "v"]);
    expect(plan[0].detalle).toBe("Pipe marcó «poco»");
  });

  it("respects switched-off reasons and open tasks", () => {
    const cs = [base({ ingredienteId: "a", aviso: { estado: "agotado", por: null, dias: 1 } }), base({ ingredienteId: "v", vendido: 3, pedidos: 2 }), base({ ingredienteId: "o", vendido: 50, abierta: true })];
    const plan = planificar(cs, { ...CONFIG_DEFAULT, reglas: { ...CONFIG_DEFAULT.reglas, aviso: false } }, 0);
    expect(plan.map((t) => t.ingredienteId)).toEqual(["v"]);
    expect(planificar(cs, { ...CONFIG_DEFAULT, max: 5 }, 5)).toEqual([]);
    expect(planificar(cs, { ...CONFIG_DEFAULT, max: 5 }, 4)).toHaveLength(1);
  });

  it("ignores stale marks and marks the system already agrees with", () => {
    const cs = [
      base({ ingredienteId: "viejo", aviso: { estado: "agotado", por: null, dias: 9 } }),
      base({ ingredienteId: "cero", stock: 0, aviso: { estado: "agotado", por: null, dias: 0 } }),
      ...["a1", "a2", "a3"].map((id) => base({ ingredienteId: id, aviso: { estado: "agotado", por: null, dias: 0 } })),
    ];
    const plan = planificar(cs, CONFIG_DEFAULT, 0);
    expect(plan.filter((t) => t.motivo === "aviso").map((t) => t.ingredienteId)).toEqual(["a1", "a2", "a3"]);
  });

  it("fills with items not counted for a long time", () => {
    const cs = [
      base({ ingredienteId: "n", diasSinContar: null }),
      base({ ingredienteId: "r", diasSinContar: 20 }),
      base({ ingredienteId: "f", diasSinContar: 3 }),
      base({ ingredienteId: "otra", ubicacion: "Bodega", diasSinContar: 30 }),
    ];
    const plan = planificar(cs, CONFIG_DEFAULT, 0);
    // one zone per day: Barra has 2 overdue items, Bodega 1
    expect(plan.map((t) => t.ingredienteId).sort()).toEqual(["n", "r"]);
  });

  it("weights negative or stale stock higher", () => {
    expect(desconfianza({ stock: -5, diasSinContar: 0 })).toBeGreaterThan(desconfianza({ stock: 5, diasSinContar: 0 }));
    const cs = [base({ ingredienteId: "ok", vendido: 10, stock: 50, diasSinContar: 0 }), base({ ingredienteId: "neg", vendido: 7, stock: -3, diasSinContar: 0 })];
    expect(planificar(cs, CONFIG_DEFAULT, 0)[0].ingredienteId).toBe("neg");
  });
});

describe("lineaAplicaSola", () => {
  it("accepts any count when the system was negative", () => {
    expect(lineaAplicaSola({ expected: -109, counted: 87, pieza: 25 })).toBe(true);
  });
  it("accepts slips within a piece or 25 %", () => {
    expect(lineaAplicaSola({ expected: 8100, counted: 7200, pieza: 900 })).toBe(true);
    expect(lineaAplicaSola({ expected: 20, counted: 16, pieza: null })).toBe(true);
  });
  it("flags big differences for a second look", () => {
    expect(lineaAplicaSola({ expected: 50400, counted: 8100, pieza: 900 })).toBe(false);
    expect(lineaAplicaSola({ expected: 20, counted: 10, pieza: null })).toBe(false);
  });
});

it("diasEntre", () => {
  expect(diasEntre("2026-11-01", "2026-11-11")).toBe(10);
});
