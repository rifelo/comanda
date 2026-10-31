"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** 44 px toggle chip; pressed = black (strong). */
export function Chip({
  pressed,
  onClick,
  className,
  children,
  ...rest
}: {
  pressed: boolean;
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "className" | "children">) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "h-11 min-h-11 px-4 rounded-full border text-[15px] font-semibold cursor-pointer whitespace-nowrap",
        pressed ? "bg-strong text-on-strong border-strong" : "bg-surface text-text border-line hover:bg-surface-2",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Chips({ label, className, children }: { label?: string; className?: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap gap-2", className)}>
      {children}
    </div>
  );
}
