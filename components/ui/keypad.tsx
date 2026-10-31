"use client";

import * as React from "react";
import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";

export const KEYPAD_DEFAULT_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "⌫"] as const;

/**
 * Numeric keypad (3 columns, 64 px keys). `onKey` receives the digit, "00",
 * "⌫" (backspace), "C" (clear) or ",". Pure input: the caller owns the value.
 * Use `applyKey` for the common "append digits" behaviour.
 */
export function Keypad({
  onKey,
  keys = KEYPAD_DEFAULT_KEYS as unknown as string[],
  className,
}: {
  onKey: (key: string) => void;
  keys?: string[];
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-3 gap-2", className)}>
      {keys.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onKey(k)}
          aria-label={k === "⌫" ? "Borrar" : k === "C" ? "Limpiar" : k}
          className={cn(
            "h-16 min-h-16 rounded-btn border border-line text-2xl font-bold ui-num cursor-pointer flex items-center justify-center select-none",
            "active:translate-y-px",
            k === "⌫" || k === "C" ? "bg-surface-2 text-text" : "bg-surface text-text hover:bg-surface-2",
          )}
        >
          {k === "⌫" ? <Delete size={24} aria-hidden /> : k}
        </button>
      ))}
    </div>
  );
}

/** Append-digits reducer for a keypad-driven string value. */
export function applyKey(current: string, key: string, maxLength = 12): string {
  if (key === "C") return "";
  if (key === "⌫") return current.slice(0, -1);
  if (key === ",") return current.includes(",") ? current : (current || "0") + ",";
  const next = current === "0" ? key.replace(/^0+/, "") || "0" : current + key;
  return next.slice(0, maxLength);
}
