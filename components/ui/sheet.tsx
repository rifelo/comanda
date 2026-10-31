"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const noop = () => () => {};
/** False during SSR and hydration, true afterwards — portals need `document`. */
export function useIsClient(): boolean {
  return React.useSyncExternalStore(noop, () => true, () => false);
}

/**
 * Modal sheet. Phone: slides up from the bottom (swipe the handle down to
 * close). ≥ 640 px: centred card, 760 px max. `side="center"` centres it on
 * phones too. Closes on Escape and on the scrim; locks page scroll; focus
 * moves into the sheet and returns to the opener on close.
 */
export function Sheet({
  open,
  onClose,
  title,
  side = "bottom",
  footer,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  side?: "bottom" | "center";
  footer?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  const isClient = useIsClient();
  const panelRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const [drag, setDrag] = React.useState(0);
  const startY = React.useRef<number | null>(null);
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => {
    onCloseRef.current = onClose;
  });

  React.useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [open]);

  if (!open || !isClient) return null;

  const bottom = side === "bottom";
  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-50 flex bg-[var(--scrim)] ui-anim-fade",
        bottom ? "items-end sm:items-center justify-center sm:p-10" : "items-center justify-center p-4 sm:p-10",
      )}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={drag > 0 ? { transform: `translateY(${drag}px)` } : undefined}
        className={cn(
          "ui-anim-sheet w-full max-w-[760px] bg-surface text-text flex flex-col outline-none",
          "max-h-[calc(100dvh-24px)] sm:max-h-[calc(100dvh-80px)]",
          bottom ? "rounded-t-[var(--r-sheet)] sm:rounded-[var(--r-sheet)] ui-safe-bottom" : "rounded-[var(--r-sheet)]",
          className,
        )}
      >
        {bottom ? (
          <div
            className="sm:hidden flex justify-center pt-2.5 pb-1 touch-none cursor-grab"
            onPointerDown={(e) => {
              startY.current = e.clientY;
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (startY.current != null) setDrag(Math.max(0, e.clientY - startY.current));
            }}
            onPointerUp={() => {
              const d = drag;
              startY.current = null;
              setDrag(0);
              if (d > 80) onClose();
            }}
            onPointerCancel={() => {
              startY.current = null;
              setDrag(0);
            }}
            aria-hidden
          >
            <span className="block w-10 h-1.5 rounded-full bg-line" />
          </div>
        ) : null}
        <div className="flex items-center gap-3 px-5 sm:px-7 pt-3 sm:pt-6 pb-3">
          <h2 id={titleId} className="ui-h2 flex-1 min-w-0 m-0">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="size-11 min-h-11 shrink-0 rounded-btn border border-line bg-surface text-text flex items-center justify-center cursor-pointer hover:bg-surface-2"
          >
            <X size={20} aria-hidden />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-7 pb-5 flex flex-col gap-5">{children}</div>
        {footer ? <div className="shrink-0 px-5 sm:px-7 pb-5 sm:pb-7 pt-1 flex gap-2.5">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
