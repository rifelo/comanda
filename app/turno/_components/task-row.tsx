"use client";

import { CmdCheck } from "@/components/comanda/primitives";
import { FotoBadge, ScheduleTag, WhoChip } from "@/components/comanda/task-bits";
import { formatTime } from "@/lib/utils";
import type { TurnoCompletion } from "@/lib/turno/server";
import type { TemplateTask } from "@/lib/types";

/**
 * One checklist row. `div role="button"` (CmdCheck is itself a <button>, and
 * buttons can't nest). 64 px tall for a tablet thumb; overdue pending rows
 * get a red edge so they read as late from across the bar.
 */
export function TurnoTaskRow({ t, c, tz, overdue, shared, busy, disabled, onToggle }: {
  t: TemplateTask;
  c: TurnoCompletion | undefined;
  tz: string;
  overdue: boolean;
  /** Task shared by every puesto (shown only on split turnos). */
  shared?: boolean;
  busy: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const done = !!c;
  const who = c?.completed_by_name ?? null;
  const act = () => { if (!disabled && !busy) onToggle(); };
  const late = overdue && !done;
  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={act}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); act(); } }}
      aria-disabled={disabled || busy}
      aria-pressed={done}
      aria-label={t.title}
      data-overdue={late || undefined}
      style={{
        width: "100%", textAlign: "left", display: "grid", gridTemplateColumns: "56px 40px 1fr auto", alignItems: "center", gap: 10, minHeight: 64,
        padding: "10px 12px", marginBottom: 6, borderRadius: 6,
        border: `1.5px solid ${done ? "var(--rule)" : late ? "var(--red)" : "var(--ink)"}`,
        boxShadow: late ? "inset 4px 0 0 var(--red)" : undefined,
        background: done ? "var(--paper)" : "var(--paper-lt)", color: "var(--ink)", fontFamily: "var(--font-mono)",
        cursor: disabled ? "default" : "pointer", opacity: busy ? 0.6 : 1,
      }}
    >
      <span>{t.due_time ? <ScheduleTag label={t.due_time.slice(0, 5)} overdue={late} /> : <span style={{ fontSize: 10, color: "var(--muted)" }}>—</span>}</span>
      <CmdCheck checked={done} size={32} mode="check" disabled={disabled} onClick={(e) => { e.stopPropagation(); act(); }} />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 17, fontWeight: 600, lineHeight: 1.2, textDecoration: done ? "line-through" : "none", opacity: done ? 0.6 : 1 }}>{t.title}</span>
        {t.instructions && !done && <span style={{ display: "block", fontSize: 12, color: "var(--ink-2)", marginTop: 3, lineHeight: 1.4 }}>{t.instructions}</span>}
        {shared && <span style={{ display: "inline-block", marginTop: 4 }}><WhoChip kind="all" text="Todos" /></span>}
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: "var(--muted)" }}>
        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          {t.requires_photo && <FotoBadge done={done && !!c?.photo_url} />}
          {done && c && <span style={{ whiteSpace: "nowrap" }}>✓ {formatTime(c.completed_at, tz)}{who ? ` · ${who}` : ""}</span>}
        </span>
        {done && c?.photo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.photo_url} alt="" width={40} height={40} style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4, border: "1px solid var(--rule)" }} />
        )}
      </span>
    </div>
  );
}
