"use client";

import { CmdCheck } from "@/components/comanda/primitives";
import { LockBox, ScheduleTag, WhoChip, whoForViewer } from "@/components/comanda/task-bits";
import { bucketAdHoc, isOverdue, toMinutes } from "@/lib/turno/blocks";
import type { TurnoActor } from "@/lib/turno/server";
import type { AdHocTask } from "@/lib/types";
import { formatTime } from "@/lib/utils";
import { SectionHead } from "./section-head";

/**
 * "Tareas inmediatas": one-off tasks the admin pushes from /hoy while the
 * turno runs. They sit above the checklist — that's the point of them.
 * Staff can tick unassigned ones or their own; an admin can tick any.
 */
export function Inmediatas({ adHoc, actor, now, tz, busy, disabled, onToggle }: {
  adHoc: AdHocTask[];
  actor: TurnoActor;
  now: string;
  tz: string;
  busy: string | null;
  disabled: boolean;
  onToggle: (task: AdHocTask, done: boolean) => void;
}) {
  const { pendientes, hechas } = bucketAdHoc(adHoc, now);
  if (pendientes.length === 0 && hechas.length === 0) return null;
  const nowMin = toMinutes(now);
  return (
    <section id="turno-sec-inmediatas" style={{ marginBottom: 18, scrollMarginTop: 12 }}>
      <SectionHead label="Tareas inmediatas" count={pendientes.length} tone={pendientes.length ? "var(--red)" : undefined} />
      {[...pendientes, ...hechas].map((t) => {
        const done = t.status === "done";
        const who = whoForViewer(t.assigned_to, actor.profileId, t.assignee_name);
        const locked = disabled || (who.locked && actor.role !== "admin");
        const late = !done && isOverdue(t, nowMin);
        const act = () => { if (!locked && busy !== t.id) onToggle(t, !done); };
        return (
          <div
            key={t.id}
            role="button"
            tabIndex={locked ? -1 : 0}
            onClick={act}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); act(); } }}
            aria-disabled={locked || busy === t.id}
            aria-pressed={done}
            aria-label={t.title}
            style={{
              display: "grid", gridTemplateColumns: "40px 1fr auto", alignItems: "center", gap: 12, minHeight: 64, padding: "10px 12px", marginBottom: 6, borderRadius: 6,
              border: `1.5px solid ${done ? "var(--rule)" : "var(--red)"}`, boxShadow: done ? undefined : "inset 4px 0 0 var(--red)",
              background: done ? "var(--paper)" : "var(--paper-lt)", color: "var(--ink)", fontFamily: "var(--font-mono)",
              cursor: locked ? "default" : "pointer", opacity: busy === t.id ? 0.6 : locked && !done ? 0.7 : 1,
            }}
          >
            {locked && !done ? <LockBox /> : <CmdCheck checked={done} size={32} mode="check" disabled={locked} onClick={(e) => { e.stopPropagation(); act(); }} />}
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 17, fontWeight: 600, lineHeight: 1.2, textDecoration: done ? "line-through" : "none", opacity: done ? 0.6 : 1 }}>{t.title}</span>
              {t.instructions && !done && <span style={{ display: "block", fontSize: 12, color: "var(--ink-2)", marginTop: 3, lineHeight: 1.4 }}>{t.instructions}</span>}
              <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 6 }}>
                {done ? (
                  <span style={{ fontSize: 10.5, color: "var(--green)" }}>✓ {t.completed_at ? formatTime(t.completed_at, tz) : ""}</span>
                ) : (
                  <>
                    <ScheduleTag label={t.due_time ? t.due_time.slice(0, 5) : "INMEDIATA"} immediate={!t.due_time} overdue={late} />
                    <WhoChip kind={who.kind} text={who.text} />
                  </>
                )}
              </span>
            </span>
            <span />
          </div>
        );
      })}
    </section>
  );
}
