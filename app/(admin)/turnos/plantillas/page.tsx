"use client";

import { useEffect, useState } from "react";
import { TurnosHeader } from "../../_components/turnos-header";
import {
  TURNO_DIA_TASKS,
  TURNO_NOCHE_TASKS,
  type TurnoTask,
} from "@/lib/mock/turnos";

type Shift = "día" | "noche";

export default function TurnosPlantillasPage() {
  const [shift, setShift] = useState<Shift>("día");
  const seed: readonly TurnoTask[] =
    shift === "día" ? TURNO_DIA_TASKS : TURNO_NOCHE_TASKS;
  const [tasks, setTasks] = useState<TurnoTask[]>(seed.map((t) => ({ ...t })));
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  useEffect(() => {
    setTasks(seed.map((t) => ({ ...t })));
    // The seed identity changes when `shift` flips, which is exactly when we
    // want to reset the list. Linting it as a missing dep would noop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shift]);

  const onDragStart = (i: number) => () => setDraggedIdx(i);
  const onDragOver = (i: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === i) return;
    const next = tasks.slice();
    const [m] = next.splice(draggedIdx, 1);
    next.splice(i, 0, m);
    setDraggedIdx(i);
    setTasks(next);
  };

  return (
    <div>
      <TurnosHeader
        kicker={`PLANTILLA · CAJERO ${shift.toUpperCase()} · v3`}
        title="Editor de plantilla"
      >
        <button type="button" className="cmd-btn ghost sm">
          Vista previa móvil
        </button>
        <button type="button" className="cmd-btn sm">
          Publicar v4
        </button>
      </TurnosHeader>

      <div
        className="text-muted"
        style={{ padding: "8px 32px 0", fontSize: 11 }}
      >
        Aplicada a Daniel&apos;s Burger · última edición ayer 18:42
      </div>

      {/* shift toggle */}
      <div
        style={{
          padding: "12px 32px 0",
          display: "flex",
          gap: 0,
          borderBottom: "1px dashed var(--rule)",
        }}
      >
        {(["día", "noche"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setShift(s)}
            className="cmd-btn ghost"
            style={{
              border: "none",
              borderBottom:
                s === shift
                  ? "2px solid var(--ink)"
                  : "2px solid transparent",
              borderRadius: 0,
              padding: "8px 14px",
              fontWeight: s === shift ? 700 : 400,
            }}
          >
            Turno {s} · {s === "día" ? 11 : 10} tareas
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <span
          className="text-muted"
          style={{
            fontSize: 10,
            alignSelf: "center",
            letterSpacing: "0.14em",
          }}
        >
          arrastrar ⠿ para reordenar
        </span>
      </div>

      <div style={{ padding: "20px 32px", maxWidth: 920 }}>
        {tasks.map((t, i) => (
          <div
            key={t.id}
            draggable
            onDragStart={onDragStart(i)}
            onDragOver={onDragOver(i)}
            onDragEnd={() => setDraggedIdx(null)}
            style={{
              display: "grid",
              gridTemplateColumns: "20px 70px 1fr auto auto",
              gap: 12,
              alignItems: "center",
              padding: "10px 12px",
              background:
                draggedIdx === i ? "var(--paper-lt)" : "transparent",
              border: `1px solid ${
                draggedIdx === i ? "var(--ink)" : "var(--rule-soft)"
              }`,
              marginBottom: 6,
              cursor: "grab",
            }}
          >
            <span
              className="text-muted"
              style={{ fontSize: 14, lineHeight: 1, userSelect: "none" }}
            >
              ⠿
            </span>
            <input
              defaultValue={t.time}
              style={{
                fontSize: 12,
                border: "1px solid var(--rule)",
                padding: "4px 6px",
                background: "var(--paper)",
                width: 60,
                textAlign: "center",
              }}
            />
            <div>
              <input
                defaultValue={t.title}
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
                defaultValue={t.instructions}
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
                defaultChecked={t.requiresPhoto}
                style={{ accentColor: "var(--red)", width: 14, height: 14 }}
              />
              FOTO
            </label>
            <button
              type="button"
              className="text-muted"
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                fontSize: 14,
              }}
              aria-label="Eliminar"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="cmd-btn ghost"
          style={{ marginTop: 10 }}
        >
          + agregar tarea
        </button>
      </div>
    </div>
  );
}
