import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Two-letter initials. Same rule as `makeInitials` in lib/db/roster.ts
 * (kept here because that module is server-only).
 */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "";
  const b = parts[1]?.[0] ?? parts[0]?.[1] ?? "";
  return (a + b).toUpperCase() || "·";
}

const SIZES = { sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-14 text-lg" } as const;

export function Avatar({ name, initials, size = "md", className }: { name: string; initials?: string; size?: keyof typeof SIZES; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("shrink-0 rounded-full bg-surface-2 text-text font-bold flex items-center justify-center", SIZES[size], className)}
    >
      {initials ?? initialsOf(name)}
    </span>
  );
}

/** «¿Quién eres?» tile on the shared-device login. */
export function PersonTile({
  name,
  initials,
  pressed,
  onClick,
  sub,
}: {
  name: string;
  initials?: string;
  pressed: boolean;
  onClick: () => void;
  sub?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center gap-2 min-h-[120px] p-3 rounded-card border-2 cursor-pointer text-text",
        pressed ? "border-brand bg-brand-soft" : "border-line bg-surface hover:bg-surface-2",
      )}
    >
      <Avatar name={name} initials={initials} size="lg" className={pressed ? "bg-brand text-on-brand" : undefined} />
      <span className="text-base font-semibold leading-tight text-center">{name}</span>
      {sub ? <span className="ui-sub">{sub}</span> : null}
    </button>
  );
}
