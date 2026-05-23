"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import type { TaskCompletion, TemplateTask } from "@/lib/types";
import { cn, formatTime } from "@/lib/utils";
import { completeTask, uncompleteTask } from "@/app/(staff)/shift/[id]/actions";
import { CmdCheck, PhotoPlaceholder } from "@/components/comanda/primitives";
import { PhotoCapture } from "./photo-capture";

interface TaskRowProps {
  task: TemplateTask;
  shiftId: string;
  restaurantId: string;
  completion?: TaskCompletion;
  userId: string;
  disabled?: boolean;
}

export function TaskRow({
  task,
  shiftId,
  restaurantId,
  completion,
  disabled,
}: TaskRowProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [photoOpen, setPhotoOpen] = useState(false);

  const isComplete = !!completion;

  function toggleSimple() {
    if (disabled || pending) return;
    setError(null);
    startTransition(async () => {
      const r = isComplete
        ? await uncompleteTask({
            shift_instance_id: shiftId,
            template_task_id: task.id,
          })
        : await completeTask({
            shift_instance_id: shiftId,
            template_task_id: task.id,
          });
      if (r?.error) setError(r.error);
    });
  }

  function onClick() {
    if (disabled) return;
    if (task.requires_photo && !isComplete) {
      setPhotoOpen(true);
      return;
    }
    toggleSimple();
  }

  async function onPhotoSubmitted(photoUrl: string) {
    setPhotoOpen(false);
    setError(null);
    startTransition(async () => {
      const r = await completeTask({
        shift_instance_id: shiftId,
        template_task_id: task.id,
        photo_url: photoUrl,
      });
      if (r?.error) setError(r.error);
    });
  }

  return (
    <>
      <li
        onClick={onClick}
        className={cn(
          "flex gap-3 cursor-pointer relative px-4 py-3",
          disabled && "opacity-60 cursor-not-allowed",
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
                toggleSimple();
              }}
              disabled={disabled}
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
              textDecoration: isComplete ? "line-through" : "none",
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
          {completion ? (
            <div
              className="mt-1.5 flex items-center gap-1.5"
              style={{
                fontSize: 10,
                color: "var(--green)",
                letterSpacing: "0.06em",
              }}
            >
              <span>✓ {formatTime(completion.completed_at)}</span>
              {completion.photo_url ? (
                <span style={{ color: "var(--muted)" }}>· 📷</span>
              ) : null}
            </div>
          ) : null}
          {error ? (
            <p
              className="mt-1.5"
              style={{ color: "var(--red)", fontSize: 11 }}
            >
              {error}
            </p>
          ) : null}
        </div>

        {task.requires_photo && !isComplete ? (
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

        {completion?.photo_url ? (
          <span
            className="self-start ml-2 overflow-hidden block relative"
            style={{ width: 48, height: 48, border: "1px solid var(--rule)" }}
          >
            <Image
              src={completion.photo_url}
              alt="Foto de evidencia"
              width={48}
              height={48}
              sizes="48px"
              unoptimized
              className="h-full w-full object-cover"
            />
          </span>
        ) : isComplete && task.requires_photo ? (
          <PhotoPlaceholder
            w={48}
            h={48}
            label="✓"
            style={{ alignSelf: "flex-start" }}
          />
        ) : null}
      </li>

      {photoOpen ? (
        <PhotoCapture
          shiftInstanceId={shiftId}
          taskId={task.id}
          taskTitle={task.title}
          restaurantId={restaurantId}
          onClose={() => setPhotoOpen(false)}
          onUploaded={onPhotoSubmitted}
        />
      ) : null}
    </>
  );
}
