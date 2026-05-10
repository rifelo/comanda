"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Lightweight bottom sheet — used for novedades, photo capture confirmation,
 * etc. Avoids pulling in Radix Dialog to keep the bundle thin.
 */
interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: React.ReactNode;
}

export function Sheet({ open, onOpenChange, title, children }: SheetProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onOpenChange(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-slate-900/50"
        onClick={() => onOpenChange(false)}
      />
      <div
        className={cn(
          "relative w-full max-w-md rounded-t-2xl bg-white shadow-xl sm:rounded-2xl",
        )}
      >
        {title ? (
          <header className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-lg font-semibold">{title}</h2>
          </header>
        ) : null}
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
