"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import type { Task } from "@/lib/types";
import { cn, formatDateLabelEs } from "@/lib/utils";
import { setMyTaskDone } from "@/app/(staff)/today/actions";
import { CmdCheck } from "@/components/comanda/primitives";
import { PhotoCapture } from "./photo-capture";

interface TaskTodoRowProps {
  task: Task;
  userId: string;
}

/** Staff-facing row for a standalone to-do. Completing a photo-required task
 *  opens the camera first; otherwise it toggles directly. */
export function TaskTodoRow({ task, userId }: TaskTodoRowProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [photoOpen, setPhotoOpen] = useState(false);

  const isDone = task.status === "done";
  const canComplete = task.assigned_to === null || task.assigned_to === userId;
  const locked = !canComplete;

  function complete(photoUrl?: string) {
    setError(null);
    startTransition(async () => {
      const r = await setMyTaskDone({
        id: task.id,
        done: true,
        photo_url: photoUrl,
      });
      if (r?.error) setError(r.error);
    });
  }

  function toggle() {
    if (locked || pending) return;
    if (isDone) {
      setError(null);
      startTransition(async () => {
        const r = await setMyTaskDone({ id: task.id, done: false });
        if (r?.error) setError(r.error);
      });
      return;
    }
    if (task.requires_photo) {
      setPhotoOpen(true);
      return;
    }
    complete();
  }

  const whenLabel = task.scheduled_date
    ? formatDateLabelEs(task.scheduled_date) +
      (task.due_time ? ` · ${task.due_time.slice(0, 5)}` : "")
    : "Sin fecha";

  return (
    <>
      <li
        onClick={toggle}
        className={cn(
          "flex gap-3 relative px-4 py-3",
          locked ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
        )}
        style={{
          borderBottom: "1px solid var(--rule-soft)",
          background: isDone ? "rgba(63,107,58,0.06)" : "transparent",
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
              checked={isDone}
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
              textDecorationLine: isDone ? "line-through" : "none",
              textDecorationColor: "rgba(31,26,20,0.5)",
            }}
          >
            {task.title}
          </div>
          {task.details ? (
            <div className="text-muted mt-0.5" style={{ fontSize: 11, lineHeight: 1.3 }}>
              {task.details}
            </div>
          ) : null}
          <div className="mt-1.5 flex items-center gap-1.5" style={{ fontSize: 10 }}>
            <span className="text-muted" style={{ letterSpacing: "0.06em" }}>
              {whenLabel}
            </span>
            {isDone && task.photo_url ? (
              <span style={{ color: "var(--muted)" }}>· 📷</span>
            ) : null}
          </div>
          {error ? (
            <p className="mt-1.5" style={{ color: "var(--red)", fontSize: 11 }}>
              {error}
            </p>
          ) : null}
        </div>

        {task.requires_photo && !isDone ? (
          <span
            className="self-start"
            style={{
              border: "1px solid var(--red)",
              color: "var(--red)",
              padding: "2px 5px",
              fontSize: 8,
              letterSpacing: "0.16em",
              borderRadius: 2,
            }}
          >
            FOTO
          </span>
        ) : null}

        {task.photo_url ? (
          <span
            className="self-start ml-2 overflow-hidden block relative"
            style={{ width: 48, height: 48, border: "1px solid var(--rule)" }}
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
          </span>
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
