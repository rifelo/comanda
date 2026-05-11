import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Comanda · paper-ticket primitives.
 *
 * Visual system: warm off-white paper, kitchen-ticket red accent, JetBrains
 * Mono ink, DM Serif Display for the wordmark, hand-drawn rotation on stamps,
 * dashed perforated rules. All page UI composes from these.
 */

// ── Wordmark · "comanda." in serif with red period ──────────────
export function Wordmark({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn("font-slab leading-none tracking-tight", className)}
      style={{ fontSize: size }}
    >
      co-manda<span className="text-red">.</span>
    </span>
  );
}

// ── Stamp · rotated red rubber-stamp glyph ──────────────────────
export function Stamp({
  children,
  rotate = -8,
  size = 11,
  color = "var(--stamp)",
  className,
  style,
}: {
  children: React.ReactNode;
  rotate?: number;
  size?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={cn(
        "inline-block font-mono font-bold uppercase opacity-80 select-none",
        className,
      )}
      style={{
        border: `1.5px solid ${color}`,
        color,
        padding: "3px 8px 2px",
        fontSize: size,
        letterSpacing: "0.12em",
        transform: `rotate(${rotate}deg)`,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

// ── CmdCheck · paper "X" or "✓" mark ─────────────────────────────
export function CmdCheck({
  checked,
  onClick,
  size = 22,
  mode = "x",
  disabled,
}: {
  checked: boolean;
  onClick?: (e: React.MouseEvent) => void;
  size?: number;
  mode?: "x" | "check";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={checked}
      className="inline-flex items-center justify-center relative shrink-0 p-0 disabled:cursor-not-allowed"
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        border: "1.5px solid var(--ink)",
        borderRadius: 3,
        background: checked ? "var(--ink)" : "var(--paper-lt)",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {checked &&
        (mode === "check" ? (
          <svg
            width={size * 0.7}
            height={size * 0.7}
            viewBox="0 0 16 16"
            aria-hidden
          >
            <path
              d="M3 8.5 L7 12 L13 4"
              fill="none"
              stroke="var(--paper-lt)"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <span
            aria-hidden
            className="font-mono font-bold leading-none"
            style={{
              color: "var(--paper-lt)",
              fontSize: size * 0.78,
              transform: "translateY(-1px)",
            }}
          >
            ✕
          </span>
        ))}
    </button>
  );
}

// ── Section label "● 10:30 ─ ─ ─ ─" ───────────────────────────
export function CmdSectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-4 pt-3.5 pb-1.5 text-muted",
        className,
      )}
      style={{
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
      }}
    >
      <span>{children}</span>
      <span
        className="flex-1 mt-px"
        style={{ borderTop: "1px dashed var(--rule)" }}
      />
    </div>
  );
}

// ── Comanda nameplate · ticket header band ──────────────────────
export function ComandaPlate({
  subtitle,
  restaurant,
  date,
  time,
  compact = false,
}: {
  subtitle?: React.ReactNode;
  restaurant?: React.ReactNode;
  date?: React.ReactNode;
  time?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className="bg-paper relative"
      style={{
        borderBottom: "1.5px solid var(--ink)",
        padding: compact ? "10px 16px 10px" : "14px 16px 12px",
      }}
    >
      <div className="flex items-baseline justify-between">
        <Wordmark size={compact ? 22 : 28} />
        {time ? (
          <div
            className="text-muted"
            style={{
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            {time}
          </div>
        ) : null}
      </div>
      {subtitle ? (
        <div
          className="text-ink-2 mt-1"
          style={{
            fontSize: 11,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {subtitle}
        </div>
      ) : null}
      {restaurant || date ? (
        <div
          className="mt-2 flex justify-between text-muted"
          style={{ fontSize: 11 }}
        >
          <span>{restaurant}</span>
          <span className="cmd-num">{date}</span>
        </div>
      ) : null}
    </div>
  );
}

// ── Folio · ticket-number badge ─────────────────────────────────
export function Folio({ n, label = "FOLIO" }: { n: React.ReactNode; label?: string }) {
  return (
    <span
      className="inline-flex flex-col items-start"
      style={{
        border: "1px solid var(--ink)",
        padding: "2px 6px",
        lineHeight: 1.1,
      }}
    >
      <span style={{ fontSize: 8, letterSpacing: "0.18em", color: "var(--muted)" }}>
        {label}
      </span>
      <span className="cmd-num" style={{ fontSize: 11, fontWeight: 700 }}>
        {n}
      </span>
    </span>
  );
}

// ── Segmented progress (ticket counter) ─────────────────────────
export function CmdProgress({
  done,
  total,
  color = "var(--ink)",
}: {
  done: number;
  total: number;
  color?: string;
}) {
  const segs = Math.min(20, Math.max(8, total || 8));
  const filled =
    total > 0 ? Math.min(segs, Math.round((done / total) * segs)) : 0;
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: segs }).map((_, i) => (
        <div
          key={i}
          style={{
            width: 6,
            height: 12,
            background: i < filled ? color : "transparent",
            border: `1px solid ${color}`,
            opacity: i < filled ? 1 : 0.35,
          }}
        />
      ))}
    </div>
  );
}

// ── Photo placeholder · diagonal stripes ────────────────────────
export function PhotoPlaceholder({
  w = "100%",
  h = 140,
  label = "foto",
  className,
  style,
}: {
  w?: number | string;
  h?: number | string;
  label?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={cn(
        "cmd-photo-stripe flex items-center justify-center text-muted",
        className,
      )}
      style={{
        width: w,
        height: h,
        border: "1px dashed var(--rule)",
        fontSize: 10,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        ...style,
      }}
    >
      {label}
    </div>
  );
}

// ── Caveat scribble caption ─────────────────────────────────────
export function Scribble({
  children,
  rotate = -1,
  size = 13,
  color = "var(--red)",
  className,
}: {
  children: React.ReactNode;
  rotate?: number;
  size?: number;
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={cn("font-script inline-block", className)}
      style={{
        fontSize: size,
        color,
        transform: `rotate(${rotate}deg)`,
      }}
    >
      {children}
    </span>
  );
}
