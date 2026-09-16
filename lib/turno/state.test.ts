import { describe, expect, it } from "vitest";
import { ALL_KEY, assignedFor, groupTasksByPuesto, puestoState, todayIdxOf, turnoProgress } from "./state";
import type { TaskCompletion, TemplatePuesto, TemplateTask } from "@/lib/types";

const task = (id: string, order_index: number, puesto_id: string | null, title = id): TemplateTask => ({
  id, template_id: "t", order_index, title, instructions: null, due_time: null, requires_photo: false, puesto_id,
});
const tp = (puesto_id: string, position: number, waits_for_task_id: string | null = null): TemplatePuesto => ({
  template_id: "t", puesto_id, position, waits_for_task_id,
  puesto: { id: puesto_id, restaurant_id: "r", name: puesto_id, color: "ink", position },
});
const done = (taskId: string, by = "u1"): TaskCompletion => ({
  id: `c-${taskId}`, shift_instance_id: "s", template_task_id: taskId, completed_by: by, completed_at: "2026-09-16T11:00:00Z", photo_url: null, note: null,
});

const abrir = task("abrir", 1, "apertura", "Abrir puerta");
const motos = task("motos", 2, "apertura", "Sacar motos");
const moler = task("moler", 3, "barista", "Moler café");
const banio = task("banio", 4, "aseo", "Baños");
const caja = task("caja", 5, null, "Contar caja");

describe("groupTasksByPuesto", () => {
  it("flat template → one __all__ group with every task", () => {
    const { groups, shared } = groupTasksByPuesto([moler, abrir], []);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe(ALL_KEY);
    expect(groups[0].tasks.map((t) => t.id)).toEqual(["abrir", "moler"]);
    expect(shared).toEqual([]);
  });
  it("groups by puesto in position order; null-puesto tasks are shared", () => {
    const { groups, shared } = groupTasksByPuesto([caja, banio, moler, motos, abrir], [tp("barista", 1, "abrir"), tp("apertura", 0), tp("aseo", 2)]);
    expect(groups.map((g) => g.key)).toEqual(["apertura", "barista", "aseo"]);
    expect(groups[0].tasks.map((t) => t.id)).toEqual(["abrir", "motos"]);
    expect(groups[1].waitsForTaskId).toBe("abrir");
    expect(shared.map((t) => t.id)).toEqual(["caja"]);
  });
  it("a task whose puesto is not on the template falls into shared", () => {
    const { groups, shared } = groupTasksByPuesto([abrir, moler], [tp("apertura", 0)]);
    expect(groups[0].tasks.map((t) => t.id)).toEqual(["abrir"]);
    expect(shared.map((t) => t.id)).toEqual(["moler"]);
  });
});

describe("puestoState", () => {
  const all = [abrir, motos, moler];
  it("waits while the gate is open and nothing is done", () => {
    const s = puestoState({ tasks: [moler], completions: {}, waitsForTaskId: "abrir", allTasks: all });
    expect(s.status).toBe("esperando");
    expect(s.gate).toMatchObject({ taskId: "abrir", title: "Abrir puerta", done: false, completedBy: null });
  });
  it("can start anyway", () => {
    expect(puestoState({ tasks: [moler], completions: {}, waitsForTaskId: "abrir", allTasks: all, startedAnyway: true }).status).toBe("por_iniciar");
  });
  it("is en_curso once its own work started, gate or not", () => {
    expect(puestoState({ tasks: [moler, banio], completions: { moler: done("moler") }, waitsForTaskId: "abrir", allTasks: all }).status).toBe("en_curso");
  });
  it("reports who opened the gate", () => {
    const s = puestoState({ tasks: [moler], completions: { abrir: done("abrir", "jesus") }, waitsForTaskId: "abrir", allTasks: all });
    expect(s.status).toBe("por_iniciar");
    expect(s.gate).toMatchObject({ done: true, completedBy: "jesus" });
  });
  it("listo when everything is done; a deleted gate task is ignored", () => {
    const s = puestoState({ tasks: [moler], completions: { moler: done("moler") }, waitsForTaskId: "gone", allTasks: all });
    expect(s.status).toBe("listo");
    expect(s.gate).toBeNull();
  });
  it("sin_tareas with no tasks", () => {
    expect(puestoState({ tasks: [], completions: {}, waitsForTaskId: null, allTasks: all }).status).toBe("sin_tareas");
  });
});

describe("turnoProgress / assignedFor / todayIdxOf", () => {
  it("progress counts every task", () => {
    expect(turnoProgress([abrir, moler], { abrir: done("abrir") })).toEqual({ done: 1, total: 2, pct: 50, allDone: false });
    expect(turnoProgress([], {})).toEqual({ done: 0, total: 0, pct: 0, allDone: false });
  });
  it("assignedFor matches puesto exactly; null only matches legacy rows", () => {
    const rows = [
      { week_start: "2026-09-14", template_id: "t", dia_idx: 2, member_id: "andres", puesto_id: "barista" },
      { week_start: "2026-09-14", template_id: "t", dia_idx: 2, member_id: "jesus", puesto_id: null },
    ];
    expect(assignedFor(rows, "t", 2, "barista")).toBe("andres");
    expect(assignedFor(rows, "t", 2, null)).toBe("jesus");
    expect(assignedFor(rows, "t", 3, "barista")).toBeNull();
  });
  it("Monday is 0 and Sunday is 6", () => {
    expect(todayIdxOf("2026-09-14")).toBe(0);
    expect(todayIdxOf("2026-09-13")).toBe(6);
  });
});
