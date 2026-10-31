"use client";

import * as React from "react";
import Link from "next/link";
import { Camera, Check as CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * List row (≥ 76 px): time · title + 2-line description · trailing slot.
 * `href` / `onClick` make the body tappable (opens the full description).
 */
export function Row({
  time,
  title,
  desc,
  full,
  trailing,
  href,
  onClick,
  muted,
  className,
}: {
  time?: React.ReactNode;
  title: React.ReactNode;
  desc?: React.ReactNode;
  full?: boolean;
  trailing?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  muted?: boolean;
  className?: string;
}) {
  const body = (
    <>
      <span className="ui-title block">{title}</span>
      {desc ? <span className={cn("mt-1 block", full ? "ui-desc-full" : "ui-desc")}>{desc}</span> : null}
    </>
  );
  const bodyCls = "flex-1 min-w-0 text-left";
  return (
    <div
      className={cn(
        "flex items-center gap-3 sm:gap-4 min-h-[76px] py-2.5 border-b border-line last:border-b-0",
        muted && "opacity-60",
        className,
      )}
    >
      {time != null ? <span className="w-12 sm:w-14 shrink-0 text-[15px] font-bold ui-num">{time}</span> : null}
      {href ? (
        <Link href={href} className={cn(bodyCls, "text-text no-underline")}>
          {body}
        </Link>
      ) : onClick ? (
        <button type="button" onClick={onClick} className={cn(bodyCls, "bg-transparent border-0 p-0 text-text cursor-pointer")}>
          {body}
        </button>
      ) : (
        <div className={bodyCls}>{body}</div>
      )}
      {trailing ? <div className="shrink-0 flex items-center gap-2">{trailing}</div> : null}
    </div>
  );
}

/** 52 px round check. `kind="photo"` shows a camera until done. */
export function Check({
  done,
  kind = "check",
  onToggle,
  disabled,
  label,
}: {
  done: boolean;
  kind?: "check" | "photo";
  onToggle?: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-label={label}
      aria-pressed={done}
      className={cn(
        "size-[52px] min-h-[52px] shrink-0 rounded-full border-2 flex items-center justify-center cursor-pointer",
        "disabled:opacity-40 disabled:cursor-not-allowed transition-colors",
        done ? "bg-ok border-ok text-on-strong" : "bg-surface border-line text-text hover:bg-surface-2",
      )}
    >
      {done || kind === "check" ? (
        <CheckIcon size={22} strokeWidth={2.6} aria-hidden />
      ) : (
        <Camera size={22} strokeWidth={2.2} aria-hidden />
      )}
    </button>
  );
}
