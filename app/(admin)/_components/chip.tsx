"use client";

/**
 * Chip — toggle-style pill button used across filter bars.
 * Pure visual primitive; parent owns the active state.
 */
import * as React from "react";

export function Chip({
  children,
  active = false,
  danger = false,
  onClick,
  asLabel = false,
}: {
  children: React.ReactNode;
  active?: boolean;
  danger?: boolean;
  onClick?: () => void;
  /** When true renders a <span> instead of a button (for non-interactive variants). */
  asLabel?: boolean;
}) {
  const bd = danger ? "var(--red)" : "var(--ink)";
  const styles: React.CSSProperties = {
    fontSize: 10,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    padding: "5px 9px",
    border: `1px solid ${bd}`,
    borderRadius: 999,
    background: active ? bd : "transparent",
    color: active ? "var(--paper-lt)" : bd,
    whiteSpace: "nowrap",
    minHeight: 0,
    cursor: onClick ? "pointer" : "default",
  };
  if (asLabel) {
    return <span style={styles}>{children}</span>;
  }
  return (
    <button type="button" onClick={onClick} style={styles}>
      {children}
    </button>
  );
}

export function StarFav({
  initialOn = false,
  size = 16,
}: {
  initialOn?: boolean;
  size?: number;
}) {
  const [on, setOn] = React.useState(initialOn);
  return (
    <button
      type="button"
      aria-label="favorito"
      aria-pressed={on}
      onClick={() => setOn((v) => !v)}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        cursor: "pointer",
        color: on ? "var(--red)" : "var(--rule)",
        lineHeight: 1,
        fontSize: size,
        minHeight: 0,
      }}
    >
      {on ? "★" : "☆"}
    </button>
  );
}

/**
 * Pill-toggle (knob) — used in Notificaciones and Modificadores.
 */
export function NotifToggle({
  initialOn,
  on: controlledOn,
  onChange,
  label,
}: {
  initialOn?: boolean;
  on?: boolean;
  onChange?: (next: boolean) => void;
  label?: React.ReactNode;
}) {
  const [internal, setInternal] = React.useState(!!initialOn);
  const isControlled = controlledOn !== undefined;
  const on = isControlled ? controlledOn! : internal;
  return (
    <button
      type="button"
      onClick={() => {
        const next = !on;
        if (!isControlled) setInternal(next);
        onChange?.(next);
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "none",
        border: "none",
        padding: 0,
        cursor: "pointer",
        minHeight: 0,
      }}
    >
      <span
        style={{
          width: 28,
          height: 16,
          borderRadius: 999,
          border: "1.5px solid var(--ink)",
          background: on ? "var(--ink)" : "var(--paper-lt)",
          position: "relative",
          flexShrink: 0,
          display: "inline-block",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 1,
            left: on ? 13 : 1,
            width: 10,
            height: 10,
            background: on ? "var(--red)" : "var(--ink)",
            borderRadius: 999,
            transition: "left .15s",
          }}
        />
      </span>
      {label ? (
        <span style={{ fontSize: 11, color: "var(--ink)" }}>{label}</span>
      ) : null}
    </button>
  );
}
