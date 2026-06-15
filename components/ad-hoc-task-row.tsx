"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import type { AdHocTask } from "@/lib/types";
import { cn, formatTime } from "@/lib/utils";
import { setAdHocDone } from "@/app/(staff)/shift/[id]/actions";
import { CmdCheck } from "@/components/comanda/primitives";

interface AdHocTaskRowProps {
  task: AdHocTask;
  userId: string;
  disabled?: boolean;
}

/** Staff-facing row for an ad-hoc (immediate / scheduled) task raised during
 *  the shift. Completable when assigned to this user or to the whole shift. */
export function AdHocTaskRow({ task, userId, disabled }: AdHocTaskRowProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isComplete = task.status === "done";
  // RLS only lets staff complete unassigned tasks or ones assigned to them.
  const canComplete =
    task.assigned_to === null || task.assigned_to === userId;
  const locked = disabled || !canComplete;

  function toggle() {
    if (locked || pending) return;
    setError(null);
    startTransition(async () => {
      const r = await setAdHocDone({
        id: task.id,
        shift_instance_id: task.shift_instance_id,
        done: !isComplete,
      });
      if (r?.error) setError(r.error);
    });
  }

  const whenLabel = task.due_time ? task.due_time.slice(0, 5) : "Inmediata";
  const whoLabel =
    task.assigned_to === null
      ? "Para todos"
      : task.assigned_to === userId
        ? "Para ti"
        : (task.assignee_name ?? "Asignada a otra persona");

  return (
    <li
      onClick={toggle}
      className={cn(
        "flex gap-3 relative px-4 py-3",
        locked ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
      )}
      style={{
        borderBottom: "1px solid var(--rule-soft)",
        background: isComplete ? "rgba(63,107,58,0.06)" : "transparent",
      }}
    >
      <div className="pt-0.5">
        {pending ? (
          <span
            className="inline-flex items-center justify-center"
            style={{
              width: 22,
              height: 22,
              border: "1.5px solid var(--ink)",
              borderRadius: 3,
              background: "var(--paper-lt)",
            }}
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          </span>
        ) : (
          <CmdCheck
            checked={isComplete}
            onClick={(e) => {
              e.stopPropagation();
              toggle();
            }}
            disabled={locked}
          />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div
          className="text-ink"
          style={{
            fontSize: 14,
            fontWeight: 500,
            lineHeight: 1.25,
            textDecorationLine: isComplete ? "line-through" : "none",
            textDecorationColor: "rgba(31,26,20,0.5)",
          }}
        >
          {task.title}
        </div>
        {task.instructions ? (
          <div
            className="text-muted mt-0.5"
            style={{ fontSize: 11, lineHeight: 1.3 }}
          >
            {task.instructions}
          </div>
        ) : null}
        <div
          className="mt-1.5"
          style={{ fontSize: 10, letterSpacing: "0.06em" }}
        >
          {isComplete && task.completed_at ? (
            <span style={{ color: "var(--green)" }}>
              ✓ {formatTime(task.completed_at)}
            </span>
          ) : (
            <span className="text-muted">{whoLabel}</span>
          )}
        </div>
        {error ? (
          <p className="mt-1.5" style={{ color: "var(--red)", fontSize: 11 }}>
            {error}
          </p>
        ) : null}
      </div>

      <span
        className="self-start whitespace-nowrap"
        style={{
          border: `1px solid ${task.due_time ? "var(--ink)" : "var(--red)"}`,
          color: task.due_time ? "var(--ink)" : "var(--red)",
          padding: "2px 5px",
          fontSize: 8,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          borderRadius: 2,
        }}
      >
        {whenLabel}
      </span>
    </li>
  );
}
