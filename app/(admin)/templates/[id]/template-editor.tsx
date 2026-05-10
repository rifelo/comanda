"use client";

import { useState, useTransition } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ChecklistTemplate, TemplateTask } from "@/lib/types";
import { saveTemplate } from "./actions";

interface DraftTask {
  id: string;
  persisted_id?: string;
  title: string;
  instructions: string;
  due_time: string;
  requires_photo: boolean;
}

export function TemplateEditor({
  template,
  initialTasks,
}: {
  template: ChecklistTemplate;
  initialTasks: TemplateTask[];
}) {
  const [tasks, setTasks] = useState<DraftTask[]>(() =>
    initialTasks.map((t) => ({
      id: t.id,
      persisted_id: t.id,
      title: t.title,
      instructions: t.instructions ?? "",
      due_time: t.due_time?.slice(0, 5) ?? "",
      requires_photo: t.requires_photo,
    })),
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function update(id: string, patch: Partial<DraftTask>) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function add() {
    setTasks((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: "",
        instructions: "",
        due_time: "",
        requires_photo: false,
      },
    ]);
  }

  function remove(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setTasks((prev) => {
      const oldIdx = prev.findIndex((t) => t.id === active.id);
      const newIdx = prev.findIndex((t) => t.id === over.id);
      if (oldIdx === -1 || newIdx === -1) return prev;
      return arrayMove(prev, oldIdx, newIdx);
    });
  }

  function onSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const r = await saveTemplate({
        template_id: template.id,
        tasks: tasks.map((t) => ({
          id: t.persisted_id,
          title: t.title.trim(),
          instructions: t.instructions.trim() || null,
          due_time: t.due_time.trim() ? `${t.due_time}:00` : null,
          requires_photo: t.requires_photo,
        })),
      });
      if (r?.error) setError(r.error);
      else setSaved(true);
    });
  }

  return (
    <div>
      <div
        className="flex items-center justify-between mb-3"
        style={{
          padding: "0 0 10px",
          borderBottom: "1px dashed var(--rule)",
        }}
      >
        <span
          className="text-muted"
          style={{
            fontSize: 10,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}
        >
          {tasks.length} tareas · arrastrar ⠿ para reordenar
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            className="cmd-btn ghost sm"
            onClick={add}
          >
            + agregar tarea
          </button>
          <button
            type="button"
            className="cmd-btn red sm"
            onClick={onSave}
            disabled={pending}
          >
            {pending ? "Guardando…" : "Publicar plantilla"}
          </button>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul style={{ maxWidth: 920 }}>
            {tasks.map((task) => (
              <SortableTaskRow
                key={task.id}
                task={task}
                onChange={(patch) => update(task.id, patch)}
                onRemove={() => remove(task.id)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <div className="flex items-center gap-3 mt-4" style={{ minHeight: 22 }}>
        {saved ? (
          <span style={{ color: "var(--green)", fontSize: 12 }}>
            ✓ Plantilla guardada
          </span>
        ) : null}
        {error ? (
          <span style={{ color: "var(--red)", fontSize: 12 }}>{error}</span>
        ) : null}
      </div>
    </div>
  );
}

function SortableTaskRow({
  task,
  onChange,
  onRemove,
}: {
  task: DraftTask;
  onChange: (patch: Partial<DraftTask>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={{
        ...style,
        display: "grid",
        gridTemplateColumns: "20px 70px 1fr auto auto",
        gap: 12,
        alignItems: "center",
        padding: "10px 12px",
        background: isDragging ? "var(--paper-lt)" : "transparent",
        border: `1px solid ${isDragging ? "var(--ink)" : "var(--rule-soft)"}`,
        marginBottom: 6,
      }}
    >
      <button
        type="button"
        className="cursor-grab"
        {...attributes}
        {...listeners}
        aria-label="Reordenar"
        style={{
          background: "transparent",
          border: "none",
          color: "var(--muted)",
          fontSize: 14,
          lineHeight: 1,
          userSelect: "none",
          padding: 0,
          minHeight: 0,
        }}
      >
        ⠿
      </button>
      <input
        defaultValue={task.due_time}
        onChange={(e) => onChange({ due_time: e.target.value })}
        placeholder="HH:MM"
        style={{
          fontFamily: "inherit",
          fontSize: 12,
          border: "1px solid var(--rule)",
          padding: "4px 6px",
          background: "var(--paper)",
          color: "var(--ink)",
          width: 60,
          textAlign: "center",
        }}
      />
      <div className="min-w-0">
        <input
          defaultValue={task.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Título de la tarea"
          style={{
            fontFamily: "inherit",
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
          defaultValue={task.instructions}
          onChange={(e) => onChange({ instructions: e.target.value })}
          placeholder="Instrucciones (opcional)"
          style={{
            fontFamily: "inherit",
            fontSize: 11,
            color: "var(--muted)",
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
        className="text-muted flex items-center gap-1.5 cursor-pointer"
        style={{ fontSize: 10, letterSpacing: "0.12em" }}
      >
        <input
          type="checkbox"
          checked={task.requires_photo}
          onChange={(e) => onChange({ requires_photo: e.target.checked })}
          style={{ accentColor: "var(--red)", width: 14, height: 14 }}
        />
        FOTO
      </label>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Eliminar tarea"
        style={{
          background: "transparent",
          border: "none",
          color: "var(--muted)",
          cursor: "pointer",
          fontSize: 16,
          padding: "0 6px",
          minHeight: 0,
        }}
      >
        ×
      </button>
    </li>
  );
}
