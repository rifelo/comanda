"use client";

/**
 * Right slide-in drawer used by create/edit flows in the admin app.
 * Modeled after the AdjustModal in `app/(admin)/stock/stock-client.tsx`:
 * fixed overlay, paper-lt body, 1.5px ink border, Esc + backdrop close.
 *
 * Pure presentation — the parent owns form state, submission, and
 * close-on-success logic.
 */
import * as React from "react";

export function Drawer({
  open,
  onClose,
  title,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    // Lock scroll behind the drawer; restore on close.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === "string" ? title : undefined}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(31,26,20,0.45)",
        zIndex: 60,
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        className="cmd-paper-lt"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 420,
          maxWidth: "100%",
          height: "100%",
          borderLeft: "1.5px solid var(--ink)",
          boxShadow: "-4px 0 0 rgba(0,0,0,.12)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          className="bg-paper"
          style={{
            padding: "14px 22px",
            borderBottom: "1.5px solid var(--ink)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <div
            className="font-slab"
            style={{
              fontSize: 18,
              letterSpacing: "-0.01em",
              lineHeight: 1.1,
              color: "var(--ink)",
            }}
          >
            {title}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cmd-link"
            style={{
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--muted)",
            }}
          >
            ✕ cerrar
          </button>
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: "22px 22px 0",
          }}
        >
          {children}
        </div>

        {footer ? (
          <div
            className="bg-paper"
            style={{
              padding: "14px 22px 18px",
              borderTop: "1.5px solid var(--ink)",
              display: "flex",
              gap: 10,
              flexShrink: 0,
            }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
