"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type SegmentedOption<T extends string> = { value: T; label: React.ReactNode; count?: number };

/**
 * Segmented control («Pendientes · 8 / Hechas · 24»). Scrolls sideways on a
 * phone when the options do not fit.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  label,
  block,
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  label?: string;
  block?: boolean;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "ui-scroll-x inline-flex max-w-full bg-surface-2 rounded-btn p-1 gap-1",
        block && "flex w-full",
        className,
      )}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex items-center justify-center gap-2 shrink-0 rounded-[9px] border-0 font-semibold cursor-pointer whitespace-nowrap",
              size === "md" ? "h-11 min-h-11 px-[18px] text-[15px]" : "h-9 min-h-9 px-3.5 text-sm",
              block && "flex-1",
              on ? "bg-surface text-text shadow-[var(--shadow-1)]" : "bg-transparent text-muted hover:text-text",
            )}
          >
            {o.label}
            {o.count != null ? <span className="ui-num">· {o.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
