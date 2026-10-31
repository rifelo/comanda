"use client";

import * as React from "react";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import type { Task } from "@/lib/types";
import { formatDateLabelEs } from "@/lib/utils";
import { CmdCheck } from "@/components/comanda/primitives";
import { AssigneeChip, FotoBadge, ScheduleTag } from "@/components/comanda/task-bits";
import { setTaskStatus, deleteTask } from "../_actions";

/** Admin row for a standalone task: quick complete/delete, opens the editor
 *  drawer via `onEdit`. */
export function TareaRow({
  task,
  today,
  onEdit,
}: {
  task: Task;
  today: string;
  onEdit: (task: Task) => void;
}) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const isDone = task.status === "done";

  const overdue = !isDone && !!task.scheduled_date && task.scheduled_date < today;
  const time = task.due_time ? task.due_time.slice(0, 5) : null;
  const baseLabel = task.scheduled_date
    ? formatDateLabelEs(task.scheduled_date) + (time ? ` · ${time}` : "")
    : "Sin fecha";
  const whenLabel = overdue ? `Vencida${time ? ` · ${time}` : ""}` : baseLabel;

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

  return (
    <div
      className="flex items-start"
      style={{
        gap: 12,
        padding: "13px 16px",
        borderBottom: "1px solid var(--rule-soft)",
        background: isDone ? "rgba(63,107,58,0.06)" : "transparent",
      }}
    >
      <div style={{ paddingTop: 1 }}>
        {pending ? (
          <span
            className="inline-flex items-center justify-center"
            style={{ width: 22, height: 22, border: "1.5px solid var(--ink)", borderRadius: 3, background: "var(--paper-lt)" }}
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          </span>
        ) : (
          <CmdCheck checked={isDone} mode="check" size={22} onClick={toggle} />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
          <span
            className="text-ink"
            style={{
              fontSize: 13.5,
              fontWeight: 500,
              textDecorationLine: isDone ? "line-through" : "none",
              textDecorationColor: "rgba(31,26,20,0.4)",
            }}
          >
            {task.title}
          </span>
          {task.requires_photo ? <FotoBadge done={isDone} /> : null}
        </div>
        {task.details ? (
          <div className="text-muted" style={{ fontSize: 11, marginTop: 2, lineHeight: 1.35 }}>
            {task.details}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center" style={{ gap: 12, marginTop: 7 }}>
          <ScheduleTag label={whenLabel} overdue={overdue} />
          <AssigneeChip name={task.assigned_to ? (task.assignee_name ?? "Asignada") : null} />
        </div>
        {error ? (
          <p style={{ color: "var(--red)", fontSize: 11, marginTop: 4 }}>{error}</p>
        ) : null}
      </div>

      {task.photo_url ? (
        <a
          href={task.photo_url}
          target="_blank"
          rel="noreferrer"
          className="relative block self-start overflow-hidden shrink-0"
          style={{ width: 40, height: 40, border: "1px solid var(--rule)", borderRadius: 3 }}
        >
          <Image
            src={task.photo_url}
            alt="Evidencia"
            width={40}
            height={40}
            sizes="40px"
            unoptimized
            className="h-full w-full object-cover"
          />
        </a>
      ) : null}

      <div className="flex shrink-0" style={{ gap: 12, paddingTop: 2 }}>
        <button
          type="button"
          onClick={() => onEdit(task)}
          disabled={pending}
          className="cmd-link"
          style={{ fontSize: 11 }}
        >
          Editar
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="text-muted"
          style={{ fontSize: 11, textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer" }}
        >
          Eliminar
        </button>
      </div>
    </div>
  );
}
