import * as React from "react";

/**
 * Shared task-row atoms for the Tareas redesign — used by the staff to-do list,
 * the live shift board, and the admin console so the two task kinds (persistent
 * tareas + ad-hoc inmediatas) speak one visual language.
 *
 * Ported from the Claude Design handoff (comanda-tareas-staff.jsx). Pure,
 * theme-token-driven; safe to render in server or client components.
 */

// ── FOTO badge — red when pending, muted once the evidence is captured ───────
export function FotoBadge({ done = false }: { done?: boolean }) {
  const color = done ? "var(--muted)" : "var(--red)";
  return (
    <span
      className="self-start font-mono"
      style={{
        border: `1.5px solid ${color}`,
        color,
        padding: "3px 6px",
        fontSize: 8.5,
        fontWeight: 700,
        letterSpacing: "0.16em",
        borderRadius: 2,
        lineHeight: 1,
      }}
    >
      FOTO
    </span>
  );
}

// ── Schedule tag — dot + label, red for overdue, filled red pill for INMEDIATA ─
export function ScheduleTag({
  label,
  overdue = false,
  immediate = false,
}: {
  label: string;
  overdue?: boolean;
  immediate?: boolean;
}) {
  if (immediate) {
    return (
      <span
        className="font-mono"
        style={{
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: "0.16em",
          color: "var(--paper-lt)",
          background: "var(--red)",
          padding: "2px 6px",
          borderRadius: 2,
        }}
      >
        INMEDIATA
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center font-mono"
      style={{
        gap: 5,
        fontSize: 10.5,
        letterSpacing: "0.04em",
        color: overdue ? "var(--red)" : "var(--muted)",
        fontWeight: overdue ? 700 : 500,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: overdue ? "var(--red)" : "var(--rule)",
          display: "inline-block",
        }}
      />
      {label}
    </span>
  );
}

export type WhoKind = "you" | "all" | "other";

// ── Who chip — "Para ti" / "Para todos" / "Asignada · Nombre" ────────────────
export function WhoChip({ kind, text }: { kind: WhoKind; text: string }) {
  const tone =
    kind === "you"
      ? "var(--ink)"
      : kind === "all"
        ? "var(--ink-2)"
        : "var(--muted)";
  return (
    <span
      className="font-mono uppercase whitespace-nowrap"
      style={{
        fontSize: 9.5,
        letterSpacing: "0.08em",
        color: tone,
        border: `1px solid ${kind === "you" ? "var(--ink)" : "var(--rule)"}`,
        padding: "2px 6px",
        borderRadius: 2,
        background: kind === "you" ? "rgba(31,26,20,0.05)" : "transparent",
      }}
    >
      {text}
    </span>
  );
}

// ── Locked checkbox stand-in — for tasks assigned to someone else ────────────
export function LockBox() {
  return (
    <span
      aria-hidden
      className="inline-flex items-center justify-center shrink-0"
      style={{
        width: 26,
        height: 26,
        minWidth: 26,
        border: "1.5px solid var(--rule)",
        borderRadius: 4,
        background: "transparent",
      }}
    >
      <span style={{ width: 9, height: 2, background: "var(--muted)", borderRadius: 1 }} />
    </span>
  );
}

// ── Avatar chip — initials in a ring, used by the admin assignee label ───────
export function AssigneeChip({ name }: { name: string | null }) {
  const assigned = !!name;
  return (
    <span
      className="inline-flex items-center"
      style={{ gap: 6, fontSize: 10.5, color: "var(--ink-2)" }}
    >
      <span
        className="inline-flex items-center justify-center"
        style={{
          width: 16,
          height: 16,
          borderRadius: "50%",
          border: "1px solid var(--rule)",
          fontSize: 7.5,
          color: "var(--muted)",
          background: assigned ? "var(--paper)" : "transparent",
        }}
      >
        {assigned ? taskInitials(name) : "··"}
      </span>
      {assigned ? name : "Cualquiera en la sede"}
    </span>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Who-label + lock state for a task relative to the viewing staffer. */
export function whoForViewer(
  assignedTo: string | null,
  userId: string,
  assigneeName?: string | null,
): { kind: WhoKind; text: string; locked: boolean } {
  if (assignedTo === userId) return { kind: "you", text: "Para ti", locked: false };
  if (assignedTo === null) return { kind: "all", text: "Para todos", locked: false };
  return {
    kind: "other",
    text: `Asignada · ${assigneeName ?? "otra persona"}`,
    locked: true,
  };
}

/** First letters of the first two name parts, uppercase. */
export function taskInitials(name: string | null): string {
  if (!name) return "··";
  return (
    name
      .replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ. ]/g, "")
      .split(/[ .]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0])
      .join("")
      .toUpperCase() || "··"
  );
}
