"use client";

import * as React from "react";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import type { RosterMember, Task } from "@/lib/types";
import { formatDateLabelEs } from "@/lib/utils";
import { CmdCheck } from "@/components/comanda/primitives";
import { setTaskStatus, deleteTask, updateTask } from "../_actions";

/** Admin row for a standalone task: quick complete/delete + inline edit
 *  (title, details, assignee, schedule, photo flag, status). */
export function TareaRow({
  task,
  roster,
}: {
  task: Task;
  roster: RosterMember[];
}) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState(false);
  const isDone = task.status === "done";

  function toggle() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const r = await setTaskStatus({ id: task.id, done: !isDone });
      if (!r.ok) setError(r.error ?? "Error");
    });
  }

  function remove() {
    if (pending) return;
    if (!confirm("¿Eliminar esta tarea?")) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteTask({ id: task.id });
      if (!r.ok) setError(r.error ?? "Error");
    });
  }

  if (editing) {
    return (
      <EditForm
        task={task}
        roster={roster}
        onClose={() => setEditing(false)}
      />
    );
  }

  const whenLabel = task.scheduled_date
    ? formatDateLabelEs(task.scheduled_date) +
      (task.due_time ? ` · ${task.due_time.slice(0, 5)}` : "")
    : "Sin fecha";
  const overdue =
    !isDone && !!task.scheduled_date && task.scheduled_date < todayISO();
  const whoLabel = task.assigned_to
    ? (task.assignee_name ?? "Asignada")
    : "Sin asignar";

  return (
    <div
      className="flex gap-3"
      style={{
        padding: "10px 0",
        borderBottom: "1px solid var(--rule-soft)",
        opacity: isDone ? 0.65 : 1,
      }}
    >
      <div className="pt-0.5">
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CmdCheck checked={isDone} mode="check" onClick={toggle} />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex justify-between gap-3">
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              textDecorationLine: isDone ? "line-through" : "none",
              textDecorationColor: "rgba(31,26,20,0.5)",
            }}
          >
            {task.title}
          </span>
          <span
            className="whitespace-nowrap"
            style={{
              fontSize: 9,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: overdue ? "var(--red)" : "var(--muted)",
              fontWeight: overdue ? 600 : 400,
            }}
          >
            {overdue ? "Vencida · " : ""}
            {whenLabel}
          </span>
        </div>
        {task.details ? (
          <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>
            {task.details}
          </div>
        ) : null}
        <div
          className="text-muted flex items-center gap-2"
          style={{ fontSize: 11, marginTop: 3 }}
        >
          <span>{whoLabel}</span>
          {task.requires_photo ? (
            <span
              style={{
                border: "1px solid var(--red)",
                color: "var(--red)",
                padding: "0 4px",
                fontSize: 8,
                letterSpacing: "0.14em",
              }}
            >
              FOTO
            </span>
          ) : null}
          <span style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={pending}
              className="cmd-link"
              style={{ fontSize: 10 }}
            >
              Editar
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="cmd-link"
              style={{ fontSize: 10, color: "var(--muted)" }}
            >
              Eliminar
            </button>
          </span>
        </div>
        {error ? (
          <p style={{ color: "var(--red)", fontSize: 11, marginTop: 2 }}>{error}</p>
        ) : null}
      </div>

      {task.photo_url ? (
        <a
          href={task.photo_url}
          target="_blank"
          rel="noreferrer"
          className="relative block self-start"
          style={{
            width: 48,
            height: 48,
            border: "1px solid var(--ink)",
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          <Image
            src={task.photo_url}
            alt="Evidencia"
            width={48}
            height={48}
            sizes="48px"
            unoptimized
            className="h-full w-full object-cover"
          />
        </a>
      ) : null}
    </div>
  );
}

function EditForm({
  task,
  roster,
  onClose,
}: {
  task: Task;
  roster: RosterMember[];
  onClose: () => void;
}) {
  const [titulo, setTitulo] = React.useState(task.title);
  const [detalle, setDetalle] = React.useState(task.details ?? "");
  const [asignado, setAsignado] = React.useState(task.assigned_to ?? "");
  const [fecha, setFecha] = React.useState(task.scheduled_date ?? "");
  const [hora, setHora] = React.useState(task.due_time?.slice(0, 5) ?? "");
  const [requiereFoto, setRequiereFoto] = React.useState(task.requires_photo);
  const [estado, setEstado] = React.useState<"pending" | "done">(
    task.status === "done" ? "done" : "pending",
  );
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const activeRoster = roster.filter(
    (m) => m.active || m.id === task.assigned_to,
  );

  function save() {
    const t = titulo.trim();
    if (!t) {
      setError("El título es requerido.");
      return;
    }
    if (hora && !fecha) {
      setError("Elige una fecha para la hora.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await updateTask({
        id: task.id,
        title: t,
        details: detalle.trim() || null,
        assigned_to: asignado || null,
        scheduled_date: fecha || null,
        due_time: hora || null,
        requires_photo: requiereFoto,
        status: estado,
      });
      if (!r.ok) {
        setError(r.error ?? "Algo salió mal.");
        return;
      }
      onClose();
    });
  }

  return (
    <div
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
      style={{
        border: "1.5px solid var(--ink)",
        background: "var(--paper)",
        padding: "12px",
        margin: "8px 0",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        className="text-muted"
        style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase" }}
      >
        Editar tarea
      </div>

      <input
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        disabled={pending}
        className="block w-full bg-transparent outline-none"
        style={inputStyle(!!error && !titulo.trim())}
      />
      <textarea
        value={detalle}
        onChange={(e) => setDetalle(e.target.value)}
        placeholder="Detalle (opcional)"
        rows={2}
        maxLength={500}
        disabled={pending}
        className="block w-full bg-transparent outline-none"
        style={{ ...inputStyle(false), resize: "vertical" }}
      />

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <label style={{ flex: "1 1 140px" }}>
          <Cap>Asignar a</Cap>
          <select
            value={asignado}
            onChange={(e) => setAsignado(e.target.value)}
            disabled={pending}
            className="block w-full bg-transparent outline-none"
            style={inputStyle(false)}
          >
            <option value="">Cualquiera en la sede</option>
            {activeRoster.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label style={{ flex: "1 1 120px" }}>
          <Cap>Estado</Cap>
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value as "pending" | "done")}
            disabled={pending}
            className="block w-full bg-transparent outline-none"
            style={inputStyle(false)}
          >
            <option value="pending">Pendiente</option>
            <option value="done">Completada</option>
          </select>
        </label>
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <label style={{ flex: 1 }}>
          <Cap>Fecha</Cap>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            disabled={pending}
            className="block w-full bg-transparent outline-none"
            style={inputStyle(false)}
          />
        </label>
        <label style={{ flex: 1 }}>
          <Cap>Hora</Cap>
          <input
            type="time"
            value={hora}
            onChange={(e) => setHora(e.target.value)}
            disabled={pending}
            className="block w-full bg-transparent outline-none"
            style={inputStyle(false)}
          />
        </label>
      </div>

      <label
        className="flex items-center gap-2"
        style={{ fontSize: 12, cursor: "pointer" }}
      >
        <input
          type="checkbox"
          checked={requiereFoto}
          onChange={(e) => setRequiereFoto(e.target.checked)}
          disabled={pending}
        />
        Requiere foto de evidencia
      </label>

      {error ? <p style={{ color: "var(--red)", fontSize: 11 }}>{error}</p> : null}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="cmd-btn ghost sm"
          style={{ flex: 1 }}
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="cmd-btn sm"
          style={{ flex: 2 }}
        >
          {pending ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}

function Cap({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-muted block"
      style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase" }}
    >
      {children}
    </span>
  );
}

function inputStyle(invalid: boolean): React.CSSProperties {
  return {
    borderBottom: `1.5px solid ${invalid ? "var(--red)" : "var(--ink)"}`,
    padding: "4px 0",
    marginTop: 2,
    fontSize: 13,
  };
}

/** Local YYYY-MM-DD for the overdue check (client tz is fine for display). */
function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
