"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import type { Task } from "@/lib/types";
import { cn, formatDateLabelEs, formatTime } from "@/lib/utils";
import { setMyTaskDone } from "@/app/(staff)/today/actions";
import { CmdCheck } from "@/components/comanda/primitives";
import {
  FotoBadge,
  LockBox,
  ScheduleTag,
  WhoChip,
  whoForViewer,
} from "@/components/comanda/task-bits";
import { PhotoCapture } from "./photo-capture";

interface TaskTodoRowProps {
  task: Task;
  userId: string;
  /** Today (YYYY-MM-DD, sede tz) — drives the overdue "Vencida" treatment. */
  today: string;
}

/** Staff-facing row for a standalone to-do. Completing a photo-required task
 *  opens the camera first; otherwise it toggles directly. */
export function TaskTodoRow({ task, userId, today }: TaskTodoRowProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [photoOpen, setPhotoOpen] = useState(false);

  const isDone = task.status === "done";
  const who = whoForViewer(task.assigned_to, userId, task.assignee_name);
  const locked = who.locked;

  function complete(photoUrl?: string) {
    setError(null);
    startTransition(async () => {
      const r = await setMyTaskDone({ id: task.id, done: true, photo_url: photoUrl });
      if (r?.error) setError(r.error);
    });
  }

  function toggle() {
    if (pending) return;
    if (isDone) {
      // Allow undo even for tasks of others? RLS still guards the write.
      setError(null);
      startTransition(async () => {
        const r = await setMyTaskDone({ id: task.id, done: false });
        if (r?.error) setError(r.error);
      });
      return;
    }
    if (locked) return;
    if (task.requires_photo) {
      setPhotoOpen(true);
      return;
    }
    complete();
  }

  const overdue =
    !isDone && !!task.scheduled_date && task.scheduled_date < today;
  const time = task.due_time ? task.due_time.slice(0, 5) : null;
  const baseLabel = task.scheduled_date
    ? formatDateLabelEs(task.scheduled_date) + (time ? ` · ${time}` : "")
    : "Sin fecha";
  const whenLabel = overdue ? `Vencida${time ? ` · ${time}` : ""}` : baseLabel;

  return (
    <>
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
          background: isDone ? "rgba(63,107,58,0.07)" : "transparent",
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
              checked={isDone}
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
              fontSize: 14.5,
              fontWeight: 500,
              lineHeight: 1.25,
              textDecorationLine: isDone ? "line-through" : "none",
              textDecorationColor: "rgba(31,26,20,0.45)",
            }}
          >
            {task.title}
          </div>
          {task.details ? (
            <div className="text-muted" style={{ fontSize: 11.5, marginTop: 2, lineHeight: 1.35 }}>
              {task.details}
            </div>
          ) : null}
          <div
            className="flex flex-wrap items-center"
            style={{ gap: 8, marginTop: 7 }}
          >
            {isDone ? (
              <span
                className="inline-flex items-center"
                style={{ gap: 6, fontSize: 10.5, color: "var(--green)", letterSpacing: "0.04em" }}
              >
                ✓ {task.completed_at ? formatTime(task.completed_at) : "Completada"}
              </span>
            ) : (
              <>
                <ScheduleTag label={whenLabel} overdue={overdue} />
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

        {task.requires_photo && !isDone ? <FotoBadge /> : null}

        {isDone && task.photo_url ? (
          <a
            href={task.photo_url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="relative block self-start overflow-hidden"
            style={{ width: 46, height: 46, minWidth: 46, borderRadius: 3, border: "1px solid var(--rule)" }}
          >
            <Image
              src={task.photo_url}
              alt="Evidencia"
              width={46}
              height={46}
              sizes="46px"
              unoptimized
              className="h-full w-full object-cover"
            />
          </a>
        ) : null}
      </li>

      {photoOpen ? (
        <PhotoCapture
          shiftInstanceId="tasks"
          taskId={task.id}
          taskTitle={task.title}
          restaurantId={task.restaurant_id}
          onClose={() => setPhotoOpen(false)}
          onUploaded={(url) => {
            setPhotoOpen(false);
            complete(url);
          }}
        />
      ) : null}
    </>
  );
}
