import * as React from "react";
import { cn } from "@/lib/utils";

export type PillTone = "neutral" | "ok" | "late" | "brand";

const TONE: Record<PillTone, string> = {
  neutral: "bg-surface-2 text-text",
  ok: "bg-ok-soft text-ok",
  late: "bg-late-soft text-late",
  brand: "bg-brand-soft text-text",
};

/** 26 px status pill: «Inmediata», «Atrasada · 9:00», «Hecha»… */
export function Pill({ tone = "neutral", className, children }: { tone?: PillTone; className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center h-[26px] px-2.5 rounded-full text-[13px] font-semibold whitespace-nowrap",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Small red count badge (tab bar, link-cards). */
export function CountBadge({ value, label }: { value: number; label?: string }) {
  if (!value) return null;
  return (
    <span
      aria-label={label ?? String(value)}
      className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-late text-white text-xs font-bold ui-num"
    >
      {value > 99 ? "99+" : value}
    </span>
  );
}
