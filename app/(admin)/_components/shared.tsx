/**
 * Shared visual primitives for the Productos module.
 *
 * Recreated from the design handoff (comanda-productos.jsx). Server-safe by
 * default — only StarFav is interactive and lives in its own client file.
 */
import * as React from "react";
import { PROD_SECTIONS, type StockStatus } from "@/lib/mock/productos";

// ── StockBadge ──────────────────────────────────────────────────
export function StockBadge({ status }: { status: StockStatus | string }) {
  const map: Record<string, { label: string; bg: string; fg: string; bd: string }> = {
    ok: { label: "Disponible", bg: "transparent", fg: "var(--green)", bd: "var(--green)" },
    bajo: { label: "Stock bajo", bg: "transparent", fg: "var(--amber)", bd: "var(--amber)" },
    sin: { label: "Sin stock", bg: "var(--red)", fg: "var(--paper-lt)", bd: "var(--red)" },
  };
  const m = map[status] ?? { label: String(status), bg: "transparent", fg: "var(--muted)", bd: "var(--muted)" };
  return (
    <span
      style={{
        display: "inline-block",
        border: `1px solid ${m.bd}`,
        color: m.fg,
        background: m.bg,
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        padding: "2px 6px",
        lineHeight: 1.3,
        whiteSpace: "nowrap",
      }}
    >
      {m.label}
    </span>
  );
}

// ── StockBar ────────────────────────────────────────────────────
export function StockBar({
  value,
  min,
  max = 100,
  unit = "",
}: {
  value: number;
  min: number;
  max?: number;
  unit?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const minPct = Math.max(0, Math.min(100, (min / max) * 100));
  const color =
    value <= 0 ? "var(--red)" : value < min ? "var(--amber)" : "var(--green)";
  return (
    <div style={{ width: "100%" }}>
      <div
        style={{
          position: "relative",
          width: "100%",
          height: 6,
          background: "var(--paper-dk)",
          border: "1px solid var(--rule)",
        }}
      >
        <div style={{ position: "absolute", inset: 0, width: `${pct}%`, background: color }} />
        <div
          title="mínimo"
          style={{
            position: "absolute",
            top: -2,
            bottom: -2,
            left: `${minPct}%`,
            width: 1,
            background: "var(--ink)",
            opacity: 0.55,
          }}
        />
      </div>
      <div
        className="cmd-num"
        style={{
          marginTop: 4,
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10,
          color: "var(--muted)",
        }}
      >
        <span style={{ color: "var(--ink)" }}>
          {value}
          {unit && ` ${unit}`}
        </span>
        <span>
          mín {min}
          {unit && ` ${unit}`}
        </span>
      </div>
    </div>
  );
}

// ── Thumb · striped product placeholder ─────────────────────────
export function Thumb({
  label = "producto",
  w = 36,
  h = 36,
}: {
  label?: string;
  w?: number;
  h?: number;
}) {
  return (
    <div
      className="cmd-photo-stripe"
      style={{
        width: w,
        height: h,
        flexShrink: 0,
        border: "1px solid var(--rule)",
        color: "var(--muted)",
        fontSize: 7,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        overflow: "hidden",
        padding: 2,
      }}
    >
      {label}
    </div>
  );
}

// ── SectionCrumb · per-page breadcrumb header ───────────────────
export function SectionCrumb({
  section,
  right,
}: {
  section: string;
  right?: React.ReactNode;
}) {
  const s = PROD_SECTIONS.find((x) => x.id === section);
  return (
    <div
      className="bg-paper"
      style={{
        padding: "16px 28px 14px",
        borderBottom: "1.5px solid var(--ink)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        position: "relative",
      }}
    >
      <div>
        <div
          className="text-muted"
          style={{
            fontSize: 10,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
          }}
        >
          Productos · {s?.n}
        </div>
        <h1
          className="font-slab"
          style={{
            fontSize: 30,
            margin: "2px 0 0",
            letterSpacing: "-0.01em",
            color: "var(--ink)",
            lineHeight: 1.05,
          }}
        >
          {s?.label}
        </h1>
      </div>
      {right ? (
        <div className="flex items-center gap-2.5">{right}</div>
      ) : null}
    </div>
  );
}

// ── ColumnLabel · little uppercase muted header for tables ──────
export function ColumnLabel({
  children,
  align = "left",
  style,
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  style?: React.CSSProperties;
}) {
  return (
    <span
      className="text-muted"
      style={{
        fontSize: 9,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        fontWeight: 600,
        textAlign: align,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

// ── SubLabel · "Categorías" style mini-section title ────────────
export function CmdMiniLabel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className="text-muted"
      style={{
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        padding: "0 4px 8px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        ...style,
      }}
    >
      <span>{children}</span>
      <span
        style={{
          flex: 1,
          borderTop: "1px dashed var(--rule)",
          marginTop: 1,
        }}
      />
    </div>
  );
}
