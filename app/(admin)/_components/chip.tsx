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
  title,
}: {
  children: React.ReactNode;
  active?: boolean;
  danger?: boolean;
  onClick?: () => void;
  /** When true renders a <span> instead of a button (for non-interactive variants). */
  asLabel?: boolean;
  /** Tooltip + accessible name, for chips whose text is an abbreviation. */
  title?: string;
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
    <button type="button" onClick={onClick} style={styles} title={title} aria-label={title} aria-pressed={onClick ? active : undefined}>
      {children}
    </button>
  );
}
