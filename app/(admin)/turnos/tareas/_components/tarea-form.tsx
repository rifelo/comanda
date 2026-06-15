"use client";

import * as React from "react";
import type { RosterMember, Task } from "@/lib/types";
import { CmdCheck } from "@/components/comanda/primitives";
import { createTask, updateTask } from "../_actions";

/** Unified create / edit form for a standalone tarea. Rendered inside the
 *  desktop drawer or the phone bottom-sheet by TareasManager. */
export function TareaForm({
  task,
  restaurantId,
  roster,
  sedeName,
  onClose,
}: {
  task: Task | null;
  restaurantId: string;
  roster: RosterMember[];
  sedeName: string;
  onClose: () => void;
}) {
  const editing = !!task;
  const [titulo, setTitulo] = React.useState(task?.title ?? "");
  const [detalle, setDetalle] = React.useState(task?.details ?? "");
  const [asignado, setAsignado] = React.useState(task?.assigned_to ?? "");
  const [fecha, setFecha] = React.useState(task?.scheduled_date ?? "");
  const [hora, setHora] = React.useState(task?.due_time?.slice(0, 5) ?? "");
  const [requiereFoto, setRequiereFoto] = React.useState(task?.requires_photo ?? false);
  const [estado, setEstado] = React.useState<"pending" | "done">(
    task?.status === "done" ? "done" : "pending",
  );
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const activeRoster = roster.filter((m) => m.active || m.id === task?.assigned_to);
  const titleValid = titulo.trim().length > 0;

  function submit() {
    if (!titleValid) {
      setError("El título es requerido.");
      return;
    }
    if (hora && !fecha) {
      setError("Elige una fecha para la hora.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = editing
        ? await updateTask({
            id: task!.id,
            title: titulo.trim(),
            details: detalle.trim() || null,
            assigned_to: asignado || null,
            scheduled_date: fecha || null,
            due_time: hora || null,
            requires_photo: requiereFoto,
            status: estado,
          })
        : await createTask({
            restaurant_id: restaurantId,
            title: titulo.trim(),
            details: detalle.trim() || undefined,
            assigned_to: asignado || undefined,
            scheduled_date: fecha || undefined,
            due_time: hora || undefined,
            requires_photo: requiereFoto,
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
      className="flex flex-col h-full bg-paper"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
    >
      {/* header */}
      <div
        className="flex items-center justify-between"
        style={{ padding: "18px 20px 14px", borderBottom: "1.5px solid var(--ink)" }}
      >
        <div>
          <div className="font-slab text-ink" style={{ fontSize: 20, lineHeight: 1 }}>
            {editing ? "Editar tarea" : "Nueva tarea"}
          </div>
          <div
            className="text-muted"
            style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", marginTop: 4 }}
          >
            {sedeName}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="text-muted"
          style={{ fontSize: 20, lineHeight: 1, padding: 4, cursor: "pointer" }}
        >
          ✕
        </button>
      </div>

      {/* body */}
      <div className="flex-1 overflow-y-auto" style={{ padding: "18px 20px" }}>
        <Field label="Título" required>
          <input
            autoFocus
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="p. ej. Limpiar nevera Coca-Cola"
            maxLength={120}
            disabled={pending}
            style={inputStyle(!!error && !titleValid)}
          />
        </Field>

        <Field label="Detalle (opcional)">
          <textarea
            value={detalle}
            onChange={(e) => setDetalle(e.target.value)}
            placeholder="Instrucciones para el equipo…"
            rows={2}
            maxLength={500}
            disabled={pending}
            style={{ ...inputStyle(false), resize: "none", lineHeight: 1.45 }}
          />
        </Field>

        <Field label="Asignar a">
          <select
            value={asignado}
            onChange={(e) => setAsignado(e.target.value)}
            disabled={pending}
            style={inputStyle(false)}
          >
            <option value="">Cualquiera en la sede</option>
            {activeRoster.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>

        {editing ? (
          <Field label="Estado">
            <select
              value={estado}
              onChange={(e) => setEstado(e.target.value as "pending" | "done")}
              disabled={pending}
              style={inputStyle(false)}
            >
              <option value="pending">Pendiente</option>
              <option value="done">Completada</option>
            </select>
          </Field>
        ) : null}

        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1.4 }}>
            <Field label="Fecha">
              <input
                type="date"
                value={fecha}
                onChange={(e) => {
                  setFecha(e.target.value);
                  if (!e.target.value) setHora("");
                }}
                disabled={pending}
                style={inputStyle(false)}
              />
            </Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label="Hora" hint={!fecha ? "Requiere fecha" : undefined}>
              <input
                type="time"
                value={hora}
                onChange={(e) => setHora(e.target.value)}
                disabled={pending || !fecha}
                style={{ ...inputStyle(false), opacity: fecha ? 1 : 0.4 }}
              />
            </Field>
          </div>
        </div>

        <div
          onClick={() => setRequiereFoto((f) => !f)}
          className="flex items-center"
          style={{
            gap: 11,
            cursor: "pointer",
            padding: "12px 0 4px",
            marginTop: 4,
            borderTop: "1px dashed var(--rule)",
          }}
        >
          <CmdCheck
            checked={requiereFoto}
            mode="check"
            size={22}
            onClick={(e) => {
              e.stopPropagation();
              setRequiereFoto((f) => !f);
            }}
          />
          <div>
            <div className="text-ink" style={{ fontSize: 13 }}>
              Requiere foto de evidencia
            </div>
            <div className="text-muted" style={{ fontSize: 10.5, marginTop: 2 }}>
              El staff deberá capturar una foto para completar.
            </div>
          </div>
        </div>

        {error ? (
          <p style={{ color: "var(--red)", fontSize: 11, marginTop: 10 }}>{error}</p>
        ) : null}
      </div>

      {/* footer */}
      <div
        className="flex"
        style={{ gap: 10, padding: "14px 20px", borderTop: "1.5px solid var(--ink)" }}
      >
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="cmd-btn ghost"
          style={{ flex: 1 }}
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="cmd-btn red"
          style={{ flex: 1.4, opacity: titleValid ? 1 : 0.5 }}
        >
          {pending ? "Guardando…" : editing ? "Guardar cambios" : "Crear tarea"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label
        className="text-muted block"
        style={{ fontSize: 9.5, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 6 }}
      >
        {label}
        {required ? <span style={{ color: "var(--red)" }}> *</span> : null}
      </label>
      {children}
      {hint ? (
        <div className="text-muted" style={{ fontSize: 10, marginTop: 5, letterSpacing: "0.03em" }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function inputStyle(invalid: boolean): React.CSSProperties {
  return {
    width: "100%",
    boxSizing: "border-box",
    fontSize: 13.5,
    color: "var(--ink)",
    background: "var(--paper-lt)",
    border: `1.5px solid ${invalid ? "var(--red)" : "var(--ink)"}`,
    borderRadius: 3,
    padding: "10px 12px",
    outline: "none",
  };
}
