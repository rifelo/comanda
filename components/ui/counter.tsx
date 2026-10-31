"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/** − value + stepper (arqueo denominations, recipe quantities). */
export function Counter({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  label,
  size = "md",
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const clamp = (n: number) => Math.max(min, max == null ? n : Math.min(max, n));
  const btn = cn(
    "rounded-btn border border-line bg-surface text-text flex items-center justify-center cursor-pointer hover:bg-surface-2 disabled:opacity-40",
    size === "md" ? "size-12 min-h-12" : "size-11 min-h-11",
  );
  return (
    <div className={cn("flex items-center gap-2", className)} role="group" aria-label={label}>
      <button type="button" className={btn} aria-label={`Menos ${label}`} disabled={value <= min} onClick={() => onChange(clamp(value - step))}>
        <Minus size={20} aria-hidden />
      </button>
      <input
        inputMode="numeric"
        aria-label={label}
        value={Number.isFinite(value) ? String(value) : ""}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/[^\d.,-]/g, "").replace(",", "."));
          onChange(clamp(Number.isFinite(n) ? n : min));
        }}
        onFocus={(e) => e.currentTarget.select()}
        className={cn(
          "rounded-btn border border-line bg-surface-2 text-text text-center font-bold ui-num font-[inherit]",
          size === "md" ? "w-[68px] h-12 text-xl" : "w-14 h-11 text-lg",
        )}
      />
      <button type="button" className={btn} aria-label={`Más ${label}`} disabled={max != null && value >= max} onClick={() => onChange(clamp(value + step))}>
        <Plus size={20} aria-hidden />
      </button>
    </div>
  );
}
