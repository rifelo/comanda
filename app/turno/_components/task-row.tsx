"use client";

import { CmdCheck } from "@/components/comanda/primitives";
import { formatTime } from "@/lib/utils";
import { splitSteps } from "@/lib/turno/steps";
import type { TurnoCompletion } from "@/lib/turno/server";
import type { TemplateTask } from "@/lib/types";

/**
 * One checklist row, sized for a tablet at arm's length: the time it is due
 * as a pill on the left (red and labelled when late), a 44 px check, the
 * title in the reading face, the instructions as numbered steps, and the
 * FOTO badge where the thumb lands. Below 900 px (portrait) the grid stacks:
 * time on top, then check + text, then the badges.
 *
 * `div role="button"` (CmdCheck is itself a <button>, and buttons can't nest).
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
  const steps = !done ? splitSteps(t.instructions) : null;
  const photoPending = t.requires_photo && !(done && !!c?.photo_url);
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
      className="trow"
      style={{
        width: "100%", textAlign: "left", minHeight: done ? 56 : 72,
        padding: done ? "10px 14px" : "14px 16px", marginBottom: 8, borderRadius: 8,
        border: `1.5px solid ${done ? "var(--rule)" : late ? "var(--red)" : "var(--ink)"}`,
        boxShadow: late ? "inset 6px 0 0 var(--red)" : undefined,
        background: done ? "var(--paper)" : "var(--paper-lt)", color: "var(--ink)",
        cursor: disabled ? "default" : "pointer", opacity: busy ? 0.6 : 1,
      }}
    >
      <span className="trow-time" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4, paddingTop: 2 }}>
        {t.due_time ? (
          <span className="cmd-num" style={{ display: "inline-flex", alignItems: "center", height: 30, padding: "0 10px", borderRadius: 6, fontSize: 15, fontWeight: 700, letterSpacing: ".02em", background: late ? "var(--red)" : done ? "transparent" : "var(--paper)", color: late ? "var(--paper-lt)" : done ? "var(--muted)" : "var(--ink)", border: `1.5px solid ${late ? "var(--red)" : done ? "transparent" : "var(--rule)"}` }}>
            {t.due_time.slice(0, 5)}
          </span>
        ) : (
          <span style={{ fontSize: 12, color: "var(--muted)", height: 30, display: "inline-flex", alignItems: "center" }}>sin hora</span>
        )}
        {late && <span className="font-mono" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--red)" }}>Atrasada</span>}
      </span>

      <span className="trow-check" style={{ paddingTop: done ? 0 : 1 }}>
        <CmdCheck checked={done} size={44} mode="check" disabled={disabled} onClick={(e) => { e.stopPropagation(); act(); }} />
      </span>

      <span className="trow-body" style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: done ? 17 : 20, fontWeight: 700, lineHeight: 1.25, textDecoration: done ? "line-through" : "none", opacity: done ? 0.6 : 1, letterSpacing: "-0.005em" }}>{t.title}</span>
        {steps && (steps.intro || steps.steps.length > 0) && (
          <span style={{ display: "block", marginTop: 6, fontSize: 15.5, lineHeight: 1.5, color: "var(--ink-2)" }}>
            {steps.intro && <span style={{ display: "block" }}>{steps.intro}</span>}
            {steps.steps.length > 0 && (
              <ol className="tsteps">
                {steps.steps.map((s, i) => (
                  <li key={i}><b>{i + 1}</b><span>{s}</span></li>
                ))}
              </ol>
            )}
            {steps.note && <span style={{ display: "block", marginTop: 6, fontSize: 14, color: "var(--muted)" }}>{steps.note}</span>}
          </span>
        )}
        {done && c && (
          <span className="cmd-num" style={{ display: "block", marginTop: 4, fontSize: 13, color: "var(--green)" }}>
            ✓ {formatTime(c.completed_at, tz)}{who ? ` · ${who}` : ""}
          </span>
        )}
      </span>

      <span className="trow-meta">
        {t.requires_photo && (
          <span className="font-mono" style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: "0 10px", borderRadius: 6, fontSize: 12, fontWeight: 700, letterSpacing: ".1em", background: photoPending && !done ? "var(--red)" : "transparent", color: photoPending && !done ? "var(--paper-lt)" : done ? "var(--muted)" : "var(--red)", border: `1.5px solid ${done ? "var(--rule)" : "var(--red)"}` }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden><path d="M4 8h3l2-3h6l2 3h3v11H4z" strokeLinejoin="round" /><circle cx="12" cy="13" r="3.5" /></svg>
            {done ? (c?.photo_url ? "CON FOTO" : "SIN FOTO") : "FOTO"}
          </span>
        )}
        {shared && !done && <span className="font-mono" style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink-2)", border: "1px solid var(--rule)", padding: "4px 8px", borderRadius: 4 }}>Todos</span>}
        {done && c?.photo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.photo_url} alt="" width={44} height={44} style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 6, border: "1px solid var(--rule)" }} />
        )}
      </span>
    </div>
  );
}
