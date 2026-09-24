"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import type { TaskCompletion, TemplateTask } from "@/lib/types";
import { cn, formatTime } from "@/lib/utils";
import { splitSteps } from "@/lib/turno/steps";
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
  const steps = !isComplete ? splitSteps(task.instructions) : null;

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
          "flex gap-3 md:gap-4 cursor-pointer relative px-4 py-3 md:py-4",
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
                width: 30,
                height: 30,
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
              size={30}
              onClick={(e) => {
                e.stopPropagation();
                // Route through the photo-aware handler so completing a
                // photo-required task opens the camera (tapping the checkbox
                // directly previously bypassed it).
                onClick();
              }}
              disabled={disabled}
            />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div
            className="text-ink"
            style={{
              fontSize: isComplete ? 15 : 17,
              fontWeight: 700,
              lineHeight: 1.25,
              textDecorationLine: isComplete ? "line-through" : "none",
              textDecorationColor: "rgba(31,26,20,0.5)",
              opacity: isComplete ? 0.7 : 1,
            }}
          >
            {task.title}
          </div>
          {steps && (steps.intro || steps.steps.length > 0) ? (
            <div className="text-ink-2 mt-1" style={{ fontSize: 14.5, lineHeight: 1.45 }}>
              {steps.intro ? <div>{steps.intro}</div> : null}
              {steps.steps.length > 0 ? (
                <ol className="tsteps">
                  {steps.steps.map((st, i) => (
                    <li key={i}><b>{i + 1}</b><span>{st}</span></li>
                  ))}
                </ol>
              ) : null}
              {steps.note ? <div className="text-muted" style={{ marginTop: 5, fontSize: 13 }}>{steps.note}</div> : null}
            </div>
          ) : null}
          {completion ? (
            <div
              className="mt-1.5 flex items-center gap-1.5"
              style={{
                fontSize: 12,
                color: "var(--green)",
                letterSpacing: "0.04em",
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
            className="self-start font-mono"
            style={{
              border: "1.5px solid var(--red)",
              background: "var(--red)",
              color: "var(--paper-lt)",
              padding: "5px 9px",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.12em",
              borderRadius: 5,
              whiteSpace: "nowrap",
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
