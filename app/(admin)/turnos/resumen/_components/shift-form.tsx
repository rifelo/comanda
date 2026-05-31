"use client";

import Link from "next/link";
import * as React from "react";
import { createShift, deleteShift, updateShift } from "../_actions";

/**
 * Wraps the deleteShift action so its return type satisfies the React
 * `<form action>` contract (`(formData) => void | Promise<void>`). On
 * success the action redirects; on error we surface the message via an
 * alert until we add an in-form error slot for delete failures.
 */
async function deleteShiftAction(formData: FormData): Promise<void> {
  const r = await deleteShift(formData);
  if (r && "error" in r && r.error) {
    // The success path redirects so this only runs on hard failure.
    if (typeof window !== "undefined") {
      window.alert(r.error);
    }
  }
}

type ShiftTaskDraft = {
  /** Stable client id (used for keys + drag). For persisted rows this equals
   *  the DB id; for new rows it's a `new-…` token. */
  key: string;
  /** Set only for persisted rows; sent to `updateShift`. */
  persistedId?: string;
  title: string;
  instructions: string;
  due_time: string;
  requires_photo: boolean;
};

export type ShiftFormInitial = {
  id: string;
  name: string;
  inicio: string;
  fin: string;
  dias: boolean[];
  tasks: {
    id: string;
    title: string;
    instructions: string | null;
    due_time: string | null;
    requires_photo: boolean;
  }[];
};

const DIAS_SEMANA = ["L", "M", "M", "J", "V", "S", "D"];

let seq = 0;
function newDraft(): ShiftTaskDraft {
  return {
    key: `new-${Date.now()}-${++seq}`,
    title: "",
    instructions: "",
    due_time: "",
    requires_photo: false,
  };
}

function toMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Format the time field while typing: keep only digits and insert the ":"
 *  automatically after the hour pair — the user types numbers, nothing else.
 *  e.g. "1" → "1", "14" → "14", "143" → "14:3", "1430" → "14:30". */
function formatTimeTyping(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 4);
  return d.length <= 2 ? d : `${d.slice(0, 2)}:${d.slice(2)}`;
}

/** Normalize on blur to a valid "HH:MM" (or "" when empty), padding partial
 *  entries and clamping hours to 23 / minutes to 59. Guarantees the value the
 *  server validates against /^\d{2}:\d{2}$/ is always well-formed. */
function normalizeTime(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (!d) return "";
  const h = Math.min(23, Number(d.slice(0, 2)));
  const m = Math.min(59, Number(d.slice(2, 4).padEnd(2, "0")));
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function ShiftForm({ initial }: { initial?: ShiftFormInitial }) {
  const editing = !!initial;
  const [name, setName] = React.useState(initial?.name ?? "");
  const [inicio, setInicio] = React.useState(initial?.inicio ?? "14:30");
  const [fin, setFin] = React.useState(initial?.fin ?? "18:30");
  const [dias, setDias] = React.useState<boolean[]>(
    initial?.dias ?? [true, true, true, true, true, false, false],
  );
  const [tasks, setTasks] = React.useState<ShiftTaskDraft[]>(() =>
    (initial?.tasks ?? []).map((t) => ({
      key: t.id,
      persistedId: t.id,
      title: t.title,
      instructions: t.instructions ?? "",
      due_time: (t.due_time ?? "").slice(0, 5),
      requires_photo: t.requires_photo,
    })),
  );
  const [draggedIdx, setDraggedIdx] = React.useState<number | null>(null);
  const [tab, setTab] = React.useState<"detalles" | "tareas">("detalles");
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const diasCount = dias.filter(Boolean).length;
  const fotoCount = tasks.filter((t) => t.requires_photo).length;
  const valid = name.trim().length > 0 && diasCount > 0;

  // duration "Hh MMm" (wraps midnight).
  let durMin = toMin(fin) - toMin(inicio);
  if (durMin <= 0) durMin += 1440;
  const dur = `${Math.floor(durMin / 60)}h ${String(durMin % 60).padStart(2, "0")}m`;

  function setTask(i: number, patch: Partial<ShiftTaskDraft>) {
    setTasks((p) => p.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  }
  function addTask() {
    setTasks((p) => [...p, newDraft()]);
  }
  function delTask(i: number) {
    setTasks((p) => p.filter((_, j) => j !== i));
  }

  function onDragStart(i: number) {
    return () => setDraggedIdx(i);
  }
  function onDragOver(i: number) {
    return (e: React.DragEvent) => {
      e.preventDefault();
      if (draggedIdx === null || draggedIdx === i) return;
      const next = tasks.slice();
      const [m] = next.splice(draggedIdx, 1);
      next.splice(i, 0, m);
      setDraggedIdx(i);
      setTasks(next);
    };
  }

  function onSave() {
    if (!valid) return;
    setError(null);
    const payloadTasks = tasks
      .filter((t) => t.title.trim().length > 0)
      .map((t) => ({
        id: t.persistedId,
        title: t.title.trim(),
        instructions: t.instructions.trim() || null,
        due_time: t.due_time.trim() ? t.due_time : null,
        requires_photo: t.requires_photo,
      }));

    startTransition(async () => {
      // Both actions redirect on success — the `await` will never resolve
      // when redirect() is hit, which is fine. Only an error result lands
      // back here.
      const result = editing
        ? await updateShift({
            id: initial!.id,
            name: name.trim(),
            inicio,
            fin,
            dias,
            tasks: payloadTasks,
          })
        : await createShift({
            name: name.trim(),
            inicio,
            fin,
            dias,
            tasks: payloadTasks,
          });
      if (result && "error" in result) setError(result.error);
    });
  }

  const inputStyle: React.CSSProperties = {
    fontSize: 15,
    border: "1px solid var(--ink)",
    background: "var(--paper)",
    padding: "11px 13px",
    color: "var(--ink)",
    width: "100%",
    outline: "none",
    borderRadius: 2,
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 9,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    color: "var(--muted)",
    marginBottom: 8,
    display: "block",
  };

  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
      {/* page header */}
      <div
        style={{
          padding: "16px 32px 16px",
          borderBottom: "1.5px solid var(--ink)",
        }}
      >
        <Link
          href="/turnos/resumen"
          className="cmd-link"
          style={{ fontSize: 11, padding: 0, marginBottom: 8, display: "inline-block" }}
        >
          ‹ Volver a turnos
        </Link>
        <div className="flex justify-between items-end">
          <div>
            <div
              className="text-muted"
              style={{ fontSize: 10, letterSpacing: "0.16em" }}
            >
              {editing ? "EDITAR TURNO" : "DEFINICIÓN"}
            </div>
            <h1
              className="font-slab"
              style={{ fontSize: 30, margin: "4px 0 0" }}
            >
              {editing ? `Editar turno ${initial?.name ?? ""}` : "Nuevo turno"}
            </h1>
          </div>
          <div className="flex" style={{ gap: 8 }}>
            <Link
              href="/turnos/resumen"
              className="cmd-btn ghost sm"
              style={{ textDecoration: "none" }}
            >
              Cancelar
            </Link>
            <button
              type="button"
              className="cmd-btn red sm"
              disabled={!valid || pending}
              onClick={onSave}
              style={{
                opacity: valid && !pending ? 1 : 0.4,
                cursor: valid && !pending ? "pointer" : "not-allowed",
              }}
            >
              {pending
                ? "Guardando…"
                : editing
                  ? "Guardar cambios"
                  : "Crear turno"}
            </button>
          </div>
        </div>
      </div>

      {/* tabs */}
      <div
        className="flex"
        style={{
          padding: "0 32px",
          borderBottom: "1px dashed var(--rule)",
          gap: 0,
        }}
      >
        {[
          { id: "detalles" as const, n: "01", label: "Detalles del turno" },
          { id: "tareas" as const, n: "02", label: "Tareas del turno" },
        ].map((tb) => {
          const on = tab === tb.id;
          return (
            <button
              key={tb.id}
              type="button"
              onClick={() => setTab(tb.id)}
              className="flex items-baseline"
              style={{
                gap: 8,
                background: "transparent",
                border: "none",
                borderBottom: on
                  ? "2px solid var(--ink)"
                  : "2px solid transparent",
                padding: "12px 16px",
                marginBottom: -1,
                cursor: "pointer",
                color: on ? "var(--ink)" : "var(--muted)",
                fontSize: 12,
                fontWeight: on ? 700 : 400,
                letterSpacing: "0.04em",
                minHeight: 0,
              }}
            >
              <span
                className="cmd-num font-slab"
                style={{
                  fontSize: 14,
                  color: on ? "var(--red)" : "var(--muted)",
                }}
              >
                {tb.n}
              </span>
              <span
                style={{
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                {tb.label}
              </span>
              {tb.id === "tareas" ? (
                <span
                  className="cmd-num text-muted"
                  style={{ fontSize: 10, fontWeight: 400 }}
                >
                  · {tasks.length}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* body */}
      <div style={{ flex: 1, padding: "28px 32px", maxWidth: 860 }}>
        {error ? (
          <div
            style={{
              border: "1px solid var(--red)",
              color: "var(--red)",
              padding: "10px 14px",
              marginBottom: 18,
              fontSize: 12,
            }}
          >
            {error}
          </div>
        ) : null}

        {tab === "detalles" ? (
          <div>
            <div style={{ maxWidth: 560 }}>
              <label style={labelStyle}>Nombre del turno</label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ej. Tarde, Madrugada, Brunch…"
                style={inputStyle}
              />
            </div>

            <div style={{ marginTop: 22, maxWidth: 560 }}>
              <label style={labelStyle}>Horario</label>
              <div
                className="grid"
                style={{ gridTemplateColumns: "1fr 1fr", gap: 16 }}
              >
                <div>
                  <div className="text-muted" style={{ fontSize: 10, marginBottom: 6 }}>
                    Inicia
                  </div>
                  <input
                    type="time"
                    value={inicio}
                    onChange={(e) => setInicio(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <div className="text-muted" style={{ fontSize: 10, marginBottom: 6 }}>
                    Termina
                  </div>
                  <input
                    type="time"
                    value={fin}
                    onChange={(e) => setFin(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>
              <div
                className="flex items-baseline"
                style={{ marginTop: 10, gap: 8 }}
              >
                <span
                  className="text-muted"
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                  }}
                >
                  Duración
                </span>
                <span
                  className="cmd-num font-slab"
                  style={{ fontSize: 18, lineHeight: 1 }}
                >
                  {dur}
                </span>
              </div>
            </div>

            <div style={{ marginTop: 22, maxWidth: 560 }}>
              <label style={labelStyle}>
                Días de operación · {diasCount}/7
              </label>
              <div className="flex" style={{ gap: 8 }}>
                {DIAS_SEMANA.map((d, i) => {
                  const on = dias[i];
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() =>
                        setDias((p) => p.map((v, j) => (j === i ? !v : v)))
                      }
                      style={{
                        flex: 1,
                        padding: "13px 0",
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: "pointer",
                        borderRadius: 2,
                        minHeight: 0,
                        border: `1px solid ${on ? "var(--ink)" : "var(--rule-soft)"}`,
                        background: on ? "var(--ink)" : "transparent",
                        color: on ? "var(--paper-lt)" : "var(--muted)",
                      }}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>

            {editing ? (
              <div
                className="flex justify-between items-center"
                style={{
                  marginTop: 22,
                  paddingTop: 22,
                  borderTop: "1px dashed var(--rule)",
                }}
              >
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>
                    Eliminar turno
                  </div>
                  <div
                    className="text-muted"
                    style={{ fontSize: 10, marginTop: 2 }}
                  >
                    Se quita de la definición de la sede. No afecta turnos
                    pasados.
                  </div>
                </div>
                <form action={deleteShiftAction}>
                  <input type="hidden" name="id" value={initial?.id ?? ""} />
                  <button
                    type="submit"
                    className="cmd-btn ghost sm"
                    style={{
                      borderColor: "var(--red)",
                      color: "var(--red)",
                    }}
                  >
                    Eliminar
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        ) : (
          <div>
            <div
              className="flex items-baseline justify-between"
              style={{ marginBottom: 6 }}
            >
              <span
                className="text-muted"
                style={{
                  fontSize: 11,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                }}
              >
                Checklist del turno
              </span>
              <span
                className="cmd-num text-muted"
                style={{ fontSize: 11 }}
              >
                {tasks.length} tareas · {fotoCount} con foto
              </span>
            </div>
            <div className="text-muted" style={{ fontSize: 11, marginBottom: 16 }}>
              Lo que el empleado debe completar durante este turno. Marca{" "}
              <strong>FOTO</strong> cuando se requiere evidencia.
            </div>

            {tasks.length === 0 ? (
              <div
                style={{
                  border: "1px dashed var(--rule)",
                  padding: 24,
                  textAlign: "center",
                  color: "var(--muted)",
                  fontSize: 12,
                  marginBottom: 12,
                }}
              >
                Aún no hay tareas. Agrega la primera para armar el checklist del
                turno.
              </div>
            ) : null}

            {tasks.map((t, i) => (
              <div
                key={t.key}
                draggable
                onDragStart={onDragStart(i)}
                onDragOver={onDragOver(i)}
                onDragEnd={() => setDraggedIdx(null)}
                className="grid items-center"
                style={{
                  gridTemplateColumns: "18px 64px 1fr auto auto",
                  gap: 12,
                  padding: "10px 12px",
                  background:
                    draggedIdx === i ? "var(--paper-lt)" : "transparent",
                  border: `1px solid ${draggedIdx === i ? "var(--ink)" : "var(--rule-soft)"}`,
                  marginBottom: 6,
                  cursor: "grab",
                }}
              >
                <span
                  className="text-muted select-none"
                  style={{ fontSize: 14, lineHeight: 1 }}
                >
                  ⠿
                </span>
                <input
                  value={t.due_time}
                  onChange={(e) =>
                    setTask(i, { due_time: formatTimeTyping(e.target.value) })
                  }
                  onBlur={(e) =>
                    setTask(i, { due_time: normalizeTime(e.target.value) })
                  }
                  inputMode="numeric"
                  maxLength={5}
                  placeholder="hh:mm"
                  style={{
                    fontSize: 12,
                    border: "1px solid var(--rule)",
                    padding: "4px 6px",
                    background: "var(--paper)",
                    width: 56,
                    textAlign: "center",
                    outline: "none",
                    color: "var(--ink)",
                  }}
                />
                <div>
                  <input
                    value={t.title}
                    onChange={(e) => setTask(i, { title: e.target.value })}
                    placeholder="Título de la tarea"
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      border: "none",
                      background: "transparent",
                      width: "100%",
                      padding: 0,
                      outline: "none",
                      color: "var(--ink)",
                    }}
                  />
                  <input
                    value={t.instructions}
                    onChange={(e) =>
                      setTask(i, { instructions: e.target.value })
                    }
                    placeholder="Instrucciones (opcional)"
                    className="text-muted"
                    style={{
                      fontSize: 11,
                      border: "none",
                      background: "transparent",
                      width: "100%",
                      padding: "2px 0 0",
                      outline: "none",
                      marginTop: 1,
                    }}
                  />
                </div>
                <label
                  className="text-muted flex items-center"
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.12em",
                    gap: 6,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={t.requires_photo}
                    onChange={(e) =>
                      setTask(i, { requires_photo: e.target.checked })
                    }
                    style={{
                      accentColor: "var(--red)",
                      width: 14,
                      height: 14,
                    }}
                  />
                  FOTO
                </label>
                <button
                  type="button"
                  onClick={() => delTask(i)}
                  className="text-muted"
                  aria-label="Eliminar tarea"
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 16,
                    lineHeight: 1,
                    minHeight: 0,
                  }}
                >
                  ×
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={addTask}
              className="cmd-btn ghost"
              style={{ marginTop: 10 }}
            >
              + agregar tarea
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
