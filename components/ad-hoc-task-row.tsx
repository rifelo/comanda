"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import type { AdHocTask } from "@/lib/types";
import { cn, formatTime } from "@/lib/utils";
import { setAdHocDone } from "@/app/(staff)/shift/[id]/actions";
import { CmdCheck } from "@/components/comanda/primitives";
import { LockBox, ScheduleTag, WhoChip, whoForViewer } from "@/components/comanda/task-bits";

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
  const who = whoForViewer(task.assigned_to, userId, task.assignee_name);
  // RLS only lets staff complete unassigned tasks or ones assigned to them.
  const locked = !!disabled || who.locked;

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

  const immediate = !task.due_time;
  const whenLabel = immediate ? "INMEDIATA" : task.due_time!.slice(0, 5);

  return (
    <li
      onClick={toggle}
      className={cn(
        "flex relative",
        locked ? "opacity-50 cursor-default" : "cursor-pointer",
      )}
      style={{
        gap: 12,
        padding: "13px 16px",
        borderBottom: "1px solid var(--rule-soft)",
        background: isComplete ? "rgba(63,107,58,0.07)" : "transparent",
      }}
    >
      <div style={{ paddingTop: 1 }}>
        {pending ? (
          <span
            className="inline-flex items-center justify-center"
            style={{
              width: 26,
              height: 26,
              border: "1.5px solid var(--ink)",
              borderRadius: 3,
              background: "var(--paper-lt)",
            }}
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          </span>
        ) : locked ? (
          <LockBox />
        ) : (
          <CmdCheck
            checked={isComplete}
            mode="check"
            size={26}
            onClick={(e) => {
              e.stopPropagation();
              toggle();
            }}
          />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div
          className="text-ink"
          style={{
            fontSize: 17,
            fontWeight: 500,
            lineHeight: 1.25,
            textDecorationLine: isComplete ? "line-through" : "none",
            textDecorationColor: "rgba(31,26,20,0.45)",
          }}
        >
          {task.title}
        </div>
        {task.instructions ? (
          <div className="text-ink-2" style={{ fontSize: 14.5, marginTop: 4, lineHeight: 1.45 }}>
            {task.instructions}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center" style={{ gap: 8, marginTop: 7 }}>
          {isComplete && task.completed_at ? (
            <span style={{ fontSize: 10.5, color: "var(--green)", letterSpacing: "0.04em" }}>
              ✓ {formatTime(task.completed_at)}
            </span>
          ) : (
            <>
              <ScheduleTag label={whenLabel} immediate={immediate} />
              <WhoChip kind={who.kind} text={who.text} />
            </>
          )}
        </div>
        {error ? (
          <p className="mt-1.5" style={{ color: "var(--red)", fontSize: 11 }}>
            {error}
          </p>
        ) : null}
      </div>
    </li>
  );
}
