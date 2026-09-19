import { describe, expect, it } from "vitest";
import { bucketAdHoc, bucketTasks, formatDuration, isOverdue, shiftMinute, summarize, toMinutes } from "./blocks";
import type { AdHocTask, TemplateTask } from "@/lib/types";

const task = (id: string, due_time: string | null, requires_photo = false, order_index = 0): TemplateTask => ({
  id, template_id: "t", order_index, title: id, instructions: null, due_time, requires_photo, puesto_id: null,
});
const adhoc = (id: string, due_time: string | null, status: AdHocTask["status"] = "pending", created_at = "2026-09-19T10:00:00Z"): AdHocTask => ({
  id, shift_instance_id: "s", restaurant_id: "r", title: id, instructions: null, assigned_to: null, created_by: "u", due_time, status,
  completed_by: null, completed_at: null, created_at,
});
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe("toMinutes / shiftMinute / isOverdue", () => {
  it("parses HH:MM and HH:MM:SS", () => {
    expect(toMinutes("06:30")).toBe(390);
    expect(toMinutes("06:30:00")).toBe(390);
    expect(toMinutes(null)).toBeNaN();
    expect(toMinutes("")).toBeNaN();
  });
  it("unwraps the clock past midnight on a night turno", () => {
    expect(shiftMinute("00:30", "22:00", "06:00")).toBe(1470);
    expect(shiftMinute("23:00", "22:00", "06:00")).toBe(1380);
    expect(shiftMinute("00:30", "06:00", "12:00")).toBe(30);
  });
  it("overdue only when a due time exists and has passed", () => {
    expect(isOverdue({ due_time: "06:00" }, toMinutes("06:01"))).toBe(true);
    expect(isOverdue({ due_time: "06:00" }, toMinutes("06:00"))).toBe(false);
    expect(isOverdue({ due_time: "06:00" }, toMinutes("06:10"), 15)).toBe(false);
    expect(isOverdue({ due_time: null }, toMinutes("23:59"))).toBe(false);
  });
});

describe("bucketTasks", () => {
  const abrir = task("abrir", "06:00");
  const maquina = task("maquina", "06:10");
  const vitrina = task("vitrina", "06:35");
  const entrega = task("entrega", "11:30");
  const garrafon = task("garrafon", null);
  const all = [abrir, maquina, vitrina, entrega, garrafon];
  const none = () => false;

  it("splits late / now / later / no-time at 06:20 (window 30)", () => {
    const b = bucketTasks({ tasks: all, done: none, now: "06:20", inicio: "06:00", fin: "12:00" });
    expect(ids(b.atrasadas)).toEqual(["abrir", "maquina"]);
    expect(ids(b.ahora)).toEqual(["vitrina"]);
    expect(ids(b.luego)).toEqual(["entrega"]);
    expect(ids(b.sin_hora)).toEqual(["garrafon"]);
    expect(b.hechas).toEqual([]);
  });
  it("done tasks go to hechas even when overdue; no-time tasks never overdue", () => {
    const b = bucketTasks({ tasks: all, done: (t) => t.id === "abrir" || t.id === "garrafon", now: "07:00", inicio: "06:00", fin: "12:00" });
    expect(ids(b.hechas)).toEqual(["abrir", "garrafon"]);
    expect(ids(b.atrasadas)).toEqual(["maquina", "vitrina"]);
  });
  it("before inicio nothing is overdue; after fin everything pending is", () => {
    const early = bucketTasks({ tasks: all, done: none, now: "05:30", inicio: "06:00", fin: "12:00" });
    expect(early.atrasadas).toEqual([]);
    expect(ids(early.ahora)).toEqual(["abrir"]); // within 30 min
    const late = bucketTasks({ tasks: all, done: none, now: "12:30", inicio: "06:00", fin: "12:00" });
    expect(ids(late.atrasadas)).toEqual(["abrir", "maquina", "vitrina", "entrega"]);
    expect(late.ahora).toEqual([]);
  });
  it("the Ahora window is inclusive on both edges", () => {
    const b = bucketTasks({ tasks: [task("edge", "06:30"), task("now", "06:00")], done: none, now: "06:00", inicio: "06:00", fin: "12:00" });
    expect(ids(b.ahora)).toEqual(["edge", "now"]);
  });
  it("night turno crossing midnight keeps comparisons linear", () => {
    const b = bucketTasks({
      tasks: [task("cerrar-puerta", "23:00"), task("caja", "01:00"), task("limpiar", "05:30")],
      done: none, now: "00:30", inicio: "22:00", fin: "06:00",
    });
    expect(ids(b.atrasadas)).toEqual(["cerrar-puerta"]);
    expect(ids(b.ahora)).toEqual(["caja"]);
    expect(ids(b.luego)).toEqual(["limpiar"]);
  });
  it("keeps input order inside each bucket", () => {
    const b = bucketTasks({ tasks: [task("b", "07:00"), task("a", "06:30")], done: none, now: "05:00", inicio: "06:00", fin: "12:00" });
    expect(ids(b.luego)).toEqual(["b", "a"]);
  });
});

describe("bucketAdHoc", () => {
  it("INMEDIATA first, then scheduled by time; cancelled dropped; done separate", () => {
    const r = bucketAdHoc(
      [adhoc("later", "11:00"), adhoc("asap-2", null, "pending", "2026-09-19T10:05:00Z"), adhoc("asap-1", null), adhoc("x", null, "cancelled"), adhoc("d", "09:00", "done"), adhoc("past", "08:00")],
      "09:30",
    );
    expect(ids(r.pendientes)).toEqual(["asap-1", "asap-2", "past", "later"]);
    expect(ids(r.hechas)).toEqual(["d"]);
    expect(r.overdue).toBe(1);
  });
});

describe("summarize / formatDuration", () => {
  it("counts photos, overdue, pendings and duration", () => {
    const tasks = [task("a", "06:00", true), task("b", "06:10", true), task("c", "11:00"), task("d", null)];
    const s = summarize({
      tasks,
      completions: { a: { photo_url: "https://x/a.jpg" }, b: { photo_url: null } },
      adHoc: [adhoc("p", null), adhoc("q", null, "done")],
      novedades: 2,
      now: "07:00", inicio: "06:00", fin: "12:00",
      opened_at: "2026-09-19T11:00:00Z", closed_at: "2026-09-19T12:35:00Z",
    });
    expect(s.done).toBe(2);
    expect(s.total).toBe(4);
    expect(s.photosDone).toBe(1);
    expect(s.photosTotal).toBe(2);
    expect(s.overdue).toBe(0); // c is 11:00 → luego; d has no time
    expect(ids(s.pendingTasks)).toEqual(["c", "d"]);
    expect(s.adHocPending).toBe(1);
    expect(s.novedades).toBe(2);
    expect(s.durationMin).toBe(95);
  });
  it("duration is null until the turno is closed", () => {
    const s = summarize({ tasks: [], completions: {}, adHoc: [], novedades: 0, now: "07:00", inicio: "06:00", fin: "12:00", opened_at: "2026-09-19T11:00:00Z", closed_at: null });
    expect(s.durationMin).toBeNull();
  });
  it("formats minutes", () => {
    expect(formatDuration(40)).toBe("40 min");
    expect(formatDuration(120)).toBe("2 h");
    expect(formatDuration(95)).toBe("1 h 35 min");
  });
});
