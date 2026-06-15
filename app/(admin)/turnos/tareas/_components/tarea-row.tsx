"use client";

import * as React from "react";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import type { Task } from "@/lib/types";
import { formatDateLabelEs } from "@/lib/utils";
import { CmdCheck } from "@/components/comanda/primitives";
import { setTaskStatus, deleteTask } from "../_actions";

/** Admin row for a standalone task: toggle done, delete, see assignee/schedule. */
export function TareaRow({ task }: { task: Task }) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
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

  const whenLabel = task.scheduled_date
    ? formatDateLabelEs(task.scheduled_date) +
      (task.due_time ? ` · ${task.due_time.slice(0, 5)}` : "")
    : "Sin fecha";
  const whoLabel = task.assigned_to
    ? (task.assignee_name ?? "Asignada")
    : "Sin asignar";

  return (
    <div
      className="flex gap-3"
      style={{
        padding: "10px 0",
        borderBottom: "1px solid var(--rule-soft)",
        opacity: isDone ? 0.7 : 1,
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
              color: task.scheduled_date ? "var(--muted)" : "var(--muted)",
            }}
          >
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
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="cmd-link"
            style={{ fontSize: 10, color: "var(--muted)", marginLeft: "auto" }}
          >
            Eliminar
          </button>
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
