"use client";

import * as React from "react";
import type { RosterMember } from "@/lib/types";
import { createAdHocTask } from "./_actions";

/**
 * Admin panel to raise a one-off task on a shift in real time — e.g.
 * "la máquina de hielo se dañó → llamar al técnico". Immediate or scheduled
 * for later the same day, optionally assigned to one person.
 */
export function AsignarTareaForm({
  shiftInstanceId,
  roster,
}: {
  shiftInstanceId: string;
  roster: RosterMember[];
}) {
  const [open, setOpen] = React.useState(false);
  const [titulo, setTitulo] = React.useState("");
  const [detalle, setDetalle] = React.useState("");
  const [asignado, setAsignado] = React.useState("");
  const [cuando, setCuando] = React.useState<"inmediata" | "programar">(
    "inmediata",
  );
  const [hora, setHora] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function reset() {
    setTitulo("");
    setDetalle("");
    setAsignado("");
    setCuando("inmediata");
    setHora("");
    setError(null);
  }

  function submit() {
    const t = titulo.trim();
    if (!t) {
      setError("El título es requerido.");
      return;
    }
    if (cuando === "programar" && !/^\d{2}:\d{2}$/.test(hora)) {
      setError("Elige una hora válida.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await createAdHocTask({
        shift_instance_id: shiftInstanceId,
        title: t,
        instructions: detalle.trim() || undefined,
        assigned_to: asignado || undefined,
        due_time: cuando === "programar" ? hora : undefined,
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
        style={{ marginBottom: 16 }}
      >
        + Asignar tarea
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
        marginBottom: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        className="text-muted"
        style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase" }}
      >
        Nueva tarea del turno
      </div>

      <Field label="Título *">
        <input
          autoFocus
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Ej. Llamar al técnico de la máquina de hielo"
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
          <option value="">Cualquiera en el turno</option>
          {activeRoster.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Cuándo">
        <div className="flex items-center gap-4" style={{ marginTop: 2 }}>
          <label className="flex items-center gap-1.5" style={{ fontSize: 12 }}>
            <input
              type="radio"
              name="cuando"
              checked={cuando === "inmediata"}
              onChange={() => setCuando("inmediata")}
              disabled={pending}
            />
            Inmediata
          </label>
          <label className="flex items-center gap-1.5" style={{ fontSize: 12 }}>
            <input
              type="radio"
              name="cuando"
              checked={cuando === "programar"}
              onChange={() => setCuando("programar")}
              disabled={pending}
            />
            Programar
          </label>
          {cuando === "programar" ? (
            <input
              type="time"
              value={hora}
              onChange={(e) => setHora(e.target.value)}
              disabled={pending}
              className="bg-transparent outline-none"
              style={{
                borderBottom: "1.5px solid var(--ink)",
                padding: "2px 0",
                fontSize: 13,
              }}
            />
          ) : null}
        </div>
      </Field>

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
          {pending ? "Asignando…" : "Asignar tarea"}
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
