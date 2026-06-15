"use client";

import * as React from "react";
import type { RosterMember } from "@/lib/types";
import { createTask } from "../_actions";

/** Admin form to create a standalone to-do for the sede. */
export function NuevaTareaForm({
  restaurantId,
  roster,
}: {
  restaurantId: string;
  roster: RosterMember[];
}) {
  const [open, setOpen] = React.useState(false);
  const [titulo, setTitulo] = React.useState("");
  const [detalle, setDetalle] = React.useState("");
  const [asignado, setAsignado] = React.useState("");
  const [fecha, setFecha] = React.useState("");
  const [hora, setHora] = React.useState("");
  const [requiereFoto, setRequiereFoto] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function reset() {
    setTitulo("");
    setDetalle("");
    setAsignado("");
    setFecha("");
    setHora("");
    setRequiereFoto(false);
    setError(null);
  }

  function submit() {
    const t = titulo.trim();
    if (!t) {
      setError("El título es requerido.");
      return;
    }
    if (hora && !fecha) {
      setError("Elige una fecha para la hora programada.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await createTask({
        restaurant_id: restaurantId,
        title: t,
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
      reset();
      setOpen(false);
    });
  }

  const activeRoster = roster.filter((m) => m.active);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="cmd-btn ghost"
        style={{ marginBottom: 20 }}
      >
        + Nueva tarea
      </button>
    );
  }

  return (
    <div
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          setOpen(false);
        }
      }}
      style={{
        border: "1.5px solid var(--ink)",
        background: "var(--paper)",
        padding: "12px 12px 14px",
        marginBottom: 20,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        maxWidth: 520,
      }}
    >
      <div
        className="text-muted"
        style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase" }}
      >
        Nueva tarea
      </div>

      <Field label="Título *">
        <input
          autoFocus
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Ej. Llamar al proveedor de carne"
          disabled={pending}
          className="block w-full bg-transparent outline-none"
          style={inputStyle(!!error && !titulo.trim())}
        />
      </Field>

      <Field label="Detalle (opcional)">
        <textarea
          value={detalle}
          onChange={(e) => setDetalle(e.target.value)}
          placeholder="Contexto o instrucciones"
          rows={2}
          maxLength={500}
          disabled={pending}
          className="block w-full bg-transparent outline-none"
          style={{ ...inputStyle(false), resize: "vertical" }}
        />
      </Field>

      <Field label="Asignar a">
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
      </Field>

      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <Field label="Fecha">
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              disabled={pending}
              className="block w-full bg-transparent outline-none"
              style={inputStyle(false)}
            />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Hora">
            <input
              type="time"
              value={hora}
              onChange={(e) => setHora(e.target.value)}
              disabled={pending}
              className="block w-full bg-transparent outline-none"
              style={inputStyle(false)}
            />
          </Field>
        </div>
      </div>

      <label
        className="flex items-center gap-2"
        style={{ fontSize: 12, marginTop: 2, cursor: "pointer" }}
      >
        <input
          type="checkbox"
          checked={requiereFoto}
          onChange={(e) => setRequiereFoto(e.target.checked)}
          disabled={pending}
        />
        Requiere foto de evidencia
      </label>

      {error ? (
        <p style={{ color: "var(--red)", fontSize: 11 }}>{error}</p>
      ) : null}

      <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="cmd-btn ghost sm"
          style={{ flex: 1 }}
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="cmd-btn sm"
          style={{ flex: 2 }}
        >
          {pending ? "Guardando…" : "Crear tarea"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="text-muted block"
        style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase" }}
      >
        {label}
      </label>
      {children}
    </div>
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
