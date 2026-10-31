"use client";

import * as React from "react";
import type { RosterMember } from "@/lib/types";
import { Plus } from "lucide-react";
import { Button, Field, Segmented, TextArea } from "@/components/ui";
import { createAdHocTask } from "./_actions";

/**
 * Admin panel to raise a one-off task on a shift in real time — e.g.
 * "la máquina de hielo se dañó → llamar al técnico". Immediate or scheduled
 * for later the same day, optionally assigned to one person.
 */
export function AsignarTareaForm({
  shiftInstanceId,
  roster,
  defaultOpen = false,
}: {
  shiftInstanceId: string;
  roster: RosterMember[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
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
      <Button type="button" variant="ghost" icon={<Plus size={20} aria-hidden />} onClick={() => setOpen(true)}>
        Asignar tarea inmediata
      </Button>
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
      className="flex flex-col gap-3.5 rounded-card bg-surface-2 p-4"
    >
      <Field
        label="¿Qué hay que hacer?"
        autoFocus
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        placeholder="Ej. Llamar al técnico de la máquina de hielo"
        disabled={pending}
        error={error && !titulo.trim() ? error : undefined}
        maxLength={160}
      />
      <TextArea
        label="Detalle (opcional)"
        value={detalle}
        onChange={(e) => setDetalle(e.target.value)}
        placeholder="Contexto o instrucciones"
        rows={2}
        maxLength={500}
        disabled={pending}
      />
      <label className="flex flex-col gap-1.5">
        <span className="ui-label">Para quién</span>
        <select
          value={asignado}
          onChange={(e) => setAsignado(e.target.value)}
          disabled={pending}
          className="h-14 rounded-btn border border-line bg-surface px-4 text-[16px] text-text"
        >
          <option value="">Cualquiera en el turno</option>
          {activeRoster.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-col gap-1.5">
        <span className="ui-label">Cuándo</span>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<"inmediata" | "programar">
            label="Cuándo"
            value={cuando}
            onChange={setCuando}
            options={[
              { value: "inmediata", label: "Ya" },
              { value: "programar", label: "A una hora" },
            ]}
          />
          {cuando === "programar" ? (
            <input
              type="time"
              aria-label="Hora"
              value={hora}
              onChange={(e) => setHora(e.target.value)}
              disabled={pending}
              className="h-12 rounded-btn border border-line bg-surface px-3 text-[16px] text-text ui-num"
            />
          ) : null}
        </div>
      </div>
      {error && titulo.trim() ? (
        <p role="alert" className="m-0 text-late font-semibold">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending} className="flex-1">
          Cancelar
        </Button>
        <Button type="button" size="sm" onClick={submit} loading={pending} className="flex-[2]">
          Asignar tarea
        </Button>
      </div>
    </div>
  );
}
