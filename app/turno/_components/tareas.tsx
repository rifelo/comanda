"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Pill, Row, toast } from "@/components/ui";
import { PhotoCapture } from "@/components/photo-capture";
import { hhmm, type ItemTarea } from "@/lib/turno/hoy";
import { splitSteps } from "@/lib/turno/steps";
import { formatDuration } from "@/lib/turno/blocks";
import type { TurnoShift } from "@/lib/turno/server";
import type { TemplateTask } from "@/lib/types";
import { completeTaskAs, setAdHocDoneAs, uncompleteTaskAs, uploadTurnoPhoto } from "../actions";
import { horaDe } from "./time";
import { VINCULOS, esVinculo } from "@/lib/turno/vinculo-info";

type Result = { ok: true } | { ok: false; error: string };

/**
 * Ticking tasks from any team screen: check / uncheck, photo tasks open the
 * camera first, inmediatas flip their status. Every write refreshes the
 * server data; `busyId` drives the spinner on the row being saved.
 */
export function useTareas(shift: TurnoShift | null, restaurantId: string) {
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [photoFor, setPhotoFor] = React.useState<TemplateTask | null>(null);

  const run = React.useCallback(
    async (id: string, fn: () => Promise<Result>) => {
      setBusyId(id);
      const r = await fn().catch(() => ({ ok: false as const, error: "Sin conexión. Intenta otra vez." }));
      setBusyId(null);
      if (!r.ok) toast(r.error, "late", 4500);
      router.refresh();
      return r.ok;
    },
    [router],
  );

  const toggle = React.useCallback(
    (item: ItemTarea) => {
      if (!shift || shift.instance.status === "closed") return;
      const sid = shift.instance.id;
      if (item.kind === "inmediata") {
        void run(item.id, () => setAdHocDoneAs({ shift_instance_id: sid, id: item.id, done: item.estado !== "hecha" }));
        return;
      }
      const done = item.estado === "hecha";
      const vinculo = esVinculo(item.task.vinculo) ? VINCULOS[item.task.vinculo] : null;
      if (vinculo) {
        // Never ticked by hand: it opens the work that completes it.
        if (done) toast(vinculo.ayuda.split(".")[0] + ".", "neutral", 3500);
        else router.push(vinculo.href);
        return;
      }
      if (!done && item.task.requires_photo) {
        setPhotoFor(item.task);
        return;
      }
      void run(item.id, () =>
        done ? uncompleteTaskAs({ shift_instance_id: sid, template_task_id: item.id }) : completeTaskAs({ shift_instance_id: sid, template_task_id: item.id }),
      );
    },
    [shift, run, router],
  );

  const camera =
    photoFor && shift ? (
      <PhotoCapture
        shiftInstanceId={shift.instance.id}
        taskId={photoFor.id}
        taskTitle={photoFor.title}
        restaurantId={restaurantId}
        upload={async (blob) => {
          const fd = new FormData();
          fd.append("file", blob, "foto.jpg");
          fd.append("shift_instance_id", shift.instance.id);
          fd.append("template_task_id", photoFor.id);
          const r = await uploadTurnoPhoto(fd);
          if (!r.ok) throw new Error(r.error);
          return r.url;
        }}
        onUploaded={(url) => {
          const task = photoFor;
          setPhotoFor(null);
          void run(task.id, () => completeTaskAs({ shift_instance_id: shift.instance.id, template_task_id: task.id, photo_url: url }));
        }}
        onClose={() => setPhotoFor(null)}
      />
    ) : null;

  return { toggle, busyId, camera };
}

/** router.refresh() every `ms` while the page is visible (the owner raises inmediatas from /hoy). */
export function useAutoRefresh(ms = 15_000) {
  const router = useRouter();
  React.useEffect(() => {
    const poll = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = window.setInterval(poll, ms);
    document.addEventListener("visibilitychange", poll);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [router, ms]);
}

/** Instructions «1) … 2) …» as a numbered list when the row is opened. */
function Instrucciones({ text, full }: { text: string; full: boolean }) {
  const s = splitSteps(text);
  if (!full || !s.steps.length) return <>{text}</>;
  return (
    <span className="flex flex-col gap-1.5">
      {s.intro ? <span>{s.intro}</span> : null}
      <ol className="m-0 pl-5 flex flex-col gap-1">
        {s.steps.map((st, i) => (
          <li key={i}>{st}</li>
        ))}
      </ol>
      {s.note ? <span className="text-muted">{s.note}</span> : null}
    </span>
  );
}

/**
 * One task (template or inmediata) as a 76 px row: time · title + pill ·
 * 2-line description (tap to read it all) · round check / camera.
 */
export function TareaRow({
  item,
  shift,
  tz,
  onToggle,
  busy,
  readOnly,
  showTime = true,
  extra,
}: {
  item: ItemTarea;
  shift: TurnoShift;
  tz: string;
  onToggle: (item: ItemTarea) => void;
  busy?: boolean;
  readOnly?: boolean;
  showTime?: boolean;
  extra?: React.ReactNode;
}) {
  const [full, setFull] = React.useState(false);
  const done = item.estado === "hecha";
  const isInm = item.kind === "inmediata";
  const title = item.task.title;
  const vinculo = !isInm && esVinculo(item.task.vinculo) ? VINCULOS[item.task.vinculo] : null;
  const instr = item.task.instructions || vinculo?.ayuda || "";
  const photo = !isInm && item.task.requires_photo;
  const comp = !isInm ? shift.completions[item.id] : null;
  const quien = isInm
    ? item.task.status === "done" && item.task.completed_at
      ? `Hecha · ${horaDe(item.task.completed_at, tz)}`
      : item.task.assignee_name
        ? `Para ${item.task.assignee_name.split(" ")[0]}`
        : null
    : comp
      ? `${(comp.completed_by_name ?? "—").split(" ")[0]} · ${horaDe(comp.completed_at, tz)}`
      : null;
  const due = hhmm(item.task.due_time);
  const refs = !isInm ? (item.task.referencias ?? []).filter((r) => r && r.url) : [];
  const desc = done ? (
    (quien ?? undefined)
  ) : instr || refs.length ? (
    <>
      {instr ? <Instrucciones text={instr} full={full} /> : null}
      {refs.length ? (
        full ? (
          <span className="mt-2 flex flex-wrap gap-3">
            {refs.map((r) => (
              <span key={r.url} className="flex flex-col gap-1 w-[44%] max-w-[220px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.url} alt={r.titulo} className="w-full rounded-lg border border-line" loading="lazy" />
                <span className="text-[13px] font-semibold">{r.titulo}</span>
              </span>
            ))}
          </span>
        ) : (
          <span className="block text-[13px] text-muted">{refs.length === 1 ? "1 foto de referencia" : `${refs.length} fotos de referencia`} · toca para ver</span>
        )
      ) : null}
    </>
  ) : (
    (quien ?? undefined)
  );
  return (
    <Row
      muted={done}
      time={showTime ? <span className={item.estado === "atrasada" ? "text-late" : undefined}>{due || (isInm ? "Ya" : "—")}</span> : undefined}
      title={
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>{title}</span>
          {item.estado === "atrasada" ? <Pill tone="late">Atrasada {formatDuration(item.tarde)}</Pill> : null}
          {isInm && !done ? <Pill tone="brand">Inmediata</Pill> : null}
          {vinculo && !done ? <Pill tone="brand">Inventario</Pill> : null}
        </span>
      }
      desc={desc}
      full={full}
      onClick={(instr || refs.length) && !done ? () => setFull((f) => !f) : undefined}
      trailing={
        <>
          {extra}
          {readOnly ? null : (
            <span className={busy ? "opacity-50 pointer-events-none" : undefined}>
              <Check
                done={done}
                kind={photo ? "photo" : "check"}
                disabled={busy || shift.instance.status === "closed"}
                label={vinculo ? (done ? `Hecha: ${title}` : `Ir a verificar: ${title}`) : done ? `Desmarcar: ${title}` : photo ? `Tomar foto: ${title}` : `Marcar hecha: ${title}`}
                onToggle={() => onToggle(item)}
              />
            </span>
          )}
        </>
      }
    />
  );
}
