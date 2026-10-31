import { describe, expect, it } from "vitest";
import type { AdHocTask, TemplateTask } from "@/lib/types";
import {
  ahora,
  bloques,
  cuerpoNovedad,
  faltanLabel,
  hhmm,
  horaApertura,
  listaTareas,
  minutosTarde,
  pasosAbrir,
  pasosCerrar,
  siguientePaso,
  tareaApertura,
  tareasApertura,
  tareasCierre,
  tareasDuranteTurno,
  turnoActual,
} from "./hoy";

let order = 0;
const task = (id: string, due_time: string | null, title = id): TemplateTask => ({
  id, template_id: "t", order_index: ++order, title, instructions: null, due_time, requires_photo: false, puesto_id: null,
});
const adhoc = (id: string, due_time: string | null, status: AdHocTask["status"] = "pending"): AdHocTask => ({
  id, shift_instance_id: "s", restaurant_id: "r", title: id, instructions: null, assigned_to: null, created_by: "u", due_time, status,
  completed_by: null, completed_at: null, created_at: "2026-10-31T10:00:00Z",
});
const ids = (xs: ReadonlyArray<{ id: string }>) => xs.map((x) => x.id);
const turno = (id: string, inicio: string, fin: string, status = "open", opened_by: string | null = null) => ({
  instance: { id, status, opened_by },
  template: { id: `t-${id}`, inicio, fin },
});

describe("hhmm / faltanLabel / minutosTarde", () => {
  it("drops the leading zero and seconds", () => {
    expect(hhmm("06:05:00")).toBe("6:05");
    expect(hhmm("13:30")).toBe("13:30");
    expect(hhmm(null)).toBe("");
  });
  it("counts down and up", () => {
    expect(faltanLabel("6:41", "7:00")).toBe("Faltan 19 min");
    expect(faltanLabel("5:55", "7:00")).toBe("Faltan 1 h 5 min");
    expect(faltanLabel("7:10", "7:00")).toBe("Hace 10 min");
    expect(faltanLabel("7:00", "07:00")).toBe("Es la hora");
    expect(faltanLabel("23:30", "01:00")).toBe("Faltan 1 h 30 min");
  });
  it("minutes late on the turno's line", () => {
    expect(minutosTarde("09:00", "09:42", "06:00", "13:30")).toBe(42);
    expect(minutosTarde("10:00", "09:42", "06:00", "13:30")).toBe(0);
    expect(minutosTarde("23:30", "00:15", "22:00", "06:00")).toBe(45);
    expect(minutosTarde(null, "09:42", "06:00", "13:30")).toBe(0);
  });
});

describe("turnoActual", () => {
  const mat = turno("mat", "06:00", "13:30");
  const noche = turno("noche", "12:30", "20:00");
  it("prefers the requested turno", () => {
    expect(turnoActual([mat, noche], "07:00", { preferId: "noche" })?.instance.id).toBe("noche");
    expect(turnoActual([mat, noche], "07:00", { preferId: "nope" })?.instance.id).toBe("mat");
  });
  it("picks the one running now; in the overlap the assigned or opened one, else the earliest", () => {
    expect(turnoActual([mat, noche], "09:00")?.instance.id).toBe("mat");
    expect(turnoActual([mat, noche], "13:00")?.instance.id).toBe("mat");
    expect(turnoActual([mat, turno("noche", "12:30", "20:00", "open", "u1")], "13:00")?.instance.id).toBe("noche");
    expect(turnoActual([mat, noche], "13:00", { asignado: (t) => t.instance.id === "noche" })?.instance.id).toBe("noche");
  });
  it("skips closed turnos; an open one past its end still owes the close", () => {
    expect(turnoActual([turno("mat", "06:00", "13:30", "closed"), noche], "13:00")?.instance.id).toBe("noche");
    expect(turnoActual([mat, turno("noche", "15:00", "20:00")], "14:00")?.instance.id).toBe("mat");
  });
  it("before the day starts → the next one; all closed → the last one; none → null", () => {
    expect(turnoActual([mat, noche], "05:00")?.instance.id).toBe("mat");
    expect(turnoActual([turno("a", "06:00", "13:30", "closed"), turno("b", "12:30", "20:00", "closed")], "21:00")?.instance.id).toBe("b");
    expect(turnoActual([], "09:00")).toBeNull();
  });
  it("handles a turno past midnight", () => {
    expect(turnoActual([turno("n", "22:00", "06:00")], "01:00")?.instance.id).toBe("n");
  });
});

describe("listaTareas / ahora", () => {
  const a = task("a", "09:00");
  const b = task("b", "09:30");
  const c = task("c", "10:30");
  const d = task("d", null);
  const e = task("e", "06:00");
  const done = new Set(["e"]);
  it("orders inmediatas, late, now, later, untimed; done apart; counts late", () => {
    const r = listaTareas({ tasks: [c, d, a, e, b], done: (t) => done.has(t.id), adHoc: [adhoc("x", null), adhoc("y", null, "done"), adhoc("z", null, "cancelled")], now: "09:42", inicio: "06:00", fin: "13:30" });
    expect(ids(r.pendientes)).toEqual(["x", "a", "b", "c", "d"]);
    expect(r.pendientes.find((i) => i.id === "a")).toMatchObject({ estado: "atrasada", tarde: 42 });
    expect(ids(r.hechas)).toEqual(["y", "e"]);
    expect(r.atrasadas).toBe(2); // a and b (9:30 < 9:42)
  });
  it("«Ahora» highlights the urgent one and lists the next", () => {
    const r = listaTareas({ tasks: [a, b, c], done: () => false, now: "09:42", inicio: "06:00", fin: "13:30" });
    const h = ahora(r.pendientes);
    expect(h.destacada?.id).toBe("a");
    expect(ids(h.siguientes)).toEqual(["b", "c"]);
    const calm = ahora(listaTareas({ tasks: [c], done: () => false, now: "09:42", inicio: "06:00", fin: "13:30" }).pendientes);
    expect(calm.destacada).toBeNull();
    expect(ids(calm.siguientes)).toEqual(["c"]);
  });
});

describe("apertura / cierre", () => {
  const tasks = [
    task("puertas", "06:30"),
    task("tacos", "06:33"),
    task("agua", "06:33"),
    task("maquina", "06:35"),
    task("pos", "06:38"),
    task("base", "06:40"),
    task("nevera", "06:43"),
    task("vitrina", "06:48"),
    task("abrir", "07:00", "Abrir al público"),
    task("insumos", "09:00"),
    task("barra", "13:30"),
    task("entrega", "13:45"),
    task("sinhora", null),
  ];
  it("finds the opening task and time", () => {
    expect(tareaApertura(tasks)?.id).toBe("abrir");
    expect(horaApertura(tasks, "06:00")).toBe("7:00");
    expect(horaApertura([task("x", "08:00")], "12:30")).toBe("13:00");
  });
  it("opening = due up to the doors, the doors excluded", () => {
    expect(ids(tareasApertura(tasks, "06:00", "13:30"))).toEqual(["puertas", "tacos", "agua", "maquina", "pos", "base", "nevera", "vitrina"]);
  });
  it("closing = last hour and after; the rest is mid-turno", () => {
    expect(ids(tareasCierre(tasks, "06:00", "13:30"))).toEqual(["barra", "entrega"]);
    expect(ids(tareasDuranteTurno(tasks, "06:00", "13:30"))).toEqual(["insumos", "sinhora"]);
  });
  it("blocks keep same-time tasks together and respect max", () => {
    const bl = bloques(tareasApertura(tasks, "06:00", "13:30"), 3);
    expect(bl.map((b) => ids(b.tasks))).toEqual([["puertas", "tacos", "agua"], ["maquina", "pos", "base"], ["nevera", "vitrina"]]);
    expect(bl[0].titulo).toBe("6:30 – 6:33");
    expect(bl.map((b) => b.key)).toEqual(["b1", "b2", "b3"]);
    // A same-time pair never splits when it can start a new block.
    expect(bloques([task("m", "06:00"), task("n", "06:01"), task("o", "06:01")], 2).map((b) => ids(b.tasks))).toEqual([["m"], ["n", "o"]]);
    const big = bloques([task("p", "06:00"), task("q", "06:00"), task("r", "06:00")], 2);
    expect(big.map((b) => ids(b.tasks))).toEqual([["p", "q"], ["r"]]);
  });
});

describe("pasos", () => {
  it("Abrir: first not-done step is now", () => {
    const p = pasosAbrir({ baseLista: true, bloques: [{ key: "b1", titulo: "6:30", total: 2, hechas: 2 }, { key: "b2", titulo: "6:40", total: 3, hechas: 1 }], apertura: "7:00", abierto: false });
    expect(p.map((s) => s.state)).toEqual(["done", "done", "now", "todo"]);
    expect(p[2]).toMatchObject({ n: 3, sub: "1 de 3" });
    expect(siguientePaso(p, "b2")?.title).toBe("Abrir al público");
    expect(siguientePaso(p, "abrir")).toBeNull();
    expect(pasosAbrir({ baseLista: false, bloques: [], apertura: "7:00", abierto: false, actual: "abrir" }).map((s) => s.state)).toEqual(["todo", "now"]);
  });
  it("Cerrar: skips the count when it doesn't apply", () => {
    const p = pasosCerrar({ tareas: { hechas: 30, total: 30 }, conteo: { debe: false, hecho: false, nombre: "Conteo diario" }, arqueo: true, base: { lista: false, monto: "$ 179.400" }, entregado: false });
    expect(p.map((s) => s.state)).toEqual(["done", "done", "done", "now", "todo"]);
    expect(p[1].sub).toBe("No toca en este turno");
  });
});

describe("cuerpoNovedad", () => {
  it("prefixes the chip", () => {
    expect(cuerpoNovedad("Se dañó algo", "  La lanza   gotea ")).toBe("Se dañó algo · La lanza gotea");
    expect(cuerpoNovedad("Otro", "Nada")).toBe("Nada");
    expect(cuerpoNovedad(null, "x")).toBe("x");
    expect(cuerpoNovedad("Faltó algo", "")).toBe("Faltó algo");
  });
});
