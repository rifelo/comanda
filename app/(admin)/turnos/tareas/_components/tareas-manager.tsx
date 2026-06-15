"use client";

import * as React from "react";
import type { RosterMember, Task } from "@/lib/types";
import { TareaRow } from "./tarea-row";

type StatusFilter = "pending" | "done" | "all";

/** Admin task console: search + status/assignee filters + grouped list, with a
 *  headline that surfaces what's still pending / overdue at a glance. */
export function TareasManager({
  tasks,
  roster,
  today,
}: {
  tasks: Task[];
  roster: RosterMember[];
  today: string;
}) {
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<StatusFilter>("pending");
  const [assignee, setAssignee] = React.useState<string>("all"); // all | none | <id>

  // Headline metrics from the full (unfiltered) set.
  const pending = tasks.filter((t) => t.status === "pending");
  const overdue = pending.filter(
    (t) => t.scheduled_date && t.scheduled_date < today,
  );
  const doneCount = tasks.filter((t) => t.status === "done").length;

  const q = query.trim().toLowerCase();
  const filtered = tasks.filter((t) => {
    if (status !== "all" && t.status !== status) return false;
    if (assignee === "none" && t.assigned_to !== null) return false;
    if (assignee !== "all" && assignee !== "none" && t.assigned_to !== assignee)
      return false;
    if (
      q &&
      !t.title.toLowerCase().includes(q) &&
      !(t.details ?? "").toLowerCase().includes(q)
    )
      return false;
    return true;
  });

  const fPending = filtered.filter((t) => t.status === "pending");
  const fDone = filtered.filter((t) => t.status === "done");
  const hoy = fPending.filter((t) => t.scheduled_date && t.scheduled_date <= today);
  const proximas = fPending.filter(
    (t) => t.scheduled_date && t.scheduled_date > today,
  );
  const sinFecha = fPending.filter((t) => !t.scheduled_date);

  return (
    <div>
      {/* headline metrics */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <Stat label="Pendientes" value={pending.length} />
        <Stat label="Vencidas" value={overdue.length} tone="red" />
        <Stat label="Completadas" value={doneCount} tone="green" />
      </div>

      {/* controls */}
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar tarea…"
          className="bg-transparent outline-none"
          style={{
            flex: "1 1 200px",
            borderBottom: "1.5px solid var(--ink)",
            padding: "5px 0",
            fontSize: 13,
          }}
        />
        <div style={{ display: "flex", gap: 4 }}>
          {(
            [
              ["pending", "Pendientes"],
              ["done", "Completadas"],
              ["all", "Todas"],
            ] as [StatusFilter, string][]
          ).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setStatus(val)}
              className={status === val ? "cmd-btn sm" : "cmd-btn ghost sm"}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          className="bg-transparent outline-none"
          style={{
            borderBottom: "1.5px solid var(--ink)",
            padding: "5px 0",
            fontSize: 12,
          }}
        >
          <option value="all">Todos</option>
          <option value="none">Sin asignar</option>
          {roster.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="text-muted" style={{ fontSize: 13 }}>
          No hay tareas que coincidan con el filtro.
        </p>
      ) : (
        <>
          {status !== "done" ? (
            <>
              <Group label="Hoy y vencidas" tasks={hoy} roster={roster} />
              <Group label="Próximas" tasks={proximas} roster={roster} />
              <Group label="Sin fecha" tasks={sinFecha} roster={roster} />
            </>
          ) : null}
          {status !== "pending" ? (
            <Group
              label={`Completadas · ${fDone.length}`}
              tasks={fDone}
              roster={roster}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "red" | "green";
}) {
  const color =
    tone === "red" ? "var(--red)" : tone === "green" ? "var(--green)" : "var(--ink)";
  return (
    <div
      style={{
        border: `1.5px solid ${color}`,
        padding: "6px 12px",
        minWidth: 92,
      }}
    >
      <div className="font-slab" style={{ fontSize: 24, lineHeight: 1, color }}>
        {value}
      </div>
      <div
        className="text-muted"
        style={{
          fontSize: 9,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          marginTop: 2,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function Group({
  label,
  tasks,
  roster,
}: {
  label: string;
  tasks: Task[];
  roster: RosterMember[];
}) {
  if (tasks.length === 0) return null;
  return (
    <section>
      <div
        className="text-muted"
        style={{
          fontSize: 10,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          margin: "16px 0 4px",
        }}
      >
        {label}
      </div>
      {tasks.map((t) => (
        <TareaRow key={t.id} task={t} roster={roster} />
      ))}
    </section>
  );
}
