import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type StepState = "todo" | "now" | "done";
export type StepItemData = { n: number; title: React.ReactNode; sub?: React.ReactNode; state: StepState; href?: string };

/** One step of a guided flow (Abrir / Cerrar el turno). */
export function StepItem({ n, title, sub, state, href }: StepItemData) {
  const cls = cn(
    "flex items-center gap-3.5 min-h-16 px-3.5 py-2 rounded-btn no-underline",
    state === "now" && "bg-brand-soft text-text",
    state === "done" && "text-text",
    state === "todo" && "text-muted",
  );
  const inner = (
    <>
      <span
        className={cn(
          "size-8 shrink-0 rounded-full flex items-center justify-center text-sm font-bold",
          state === "now" && "bg-brand text-on-brand",
          state === "done" && "bg-ok text-on-strong",
          state === "todo" && "bg-surface-2 text-muted",
        )}
      >
        {state === "done" ? <Check size={16} strokeWidth={3} aria-hidden /> : n}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-base font-semibold">{title}</span>
        {sub ? <span className="block text-[13px] text-muted">{sub}</span> : null}
      </span>
    </>
  );
  return (
    <li aria-current={state === "now" ? "step" : undefined}>
      {href ? (
        <Link href={href} className={cls}>
          {inner}
        </Link>
      ) : (
        <div className={cls}>{inner}</div>
      )}
    </li>
  );
}

export function Steps({ items, label }: { items: StepItemData[]; label?: string }) {
  return (
    <ol aria-label={label} className="flex flex-col gap-1 m-0 p-0 list-none">
      {items.map((s) => (
        <StepItem key={s.n} {...s} />
      ))}
    </ol>
  );
}

/** Progress dots for a flow header: done = green, current = brand. */
export function StepDots({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex gap-1.5" role="img" aria-label={`Paso ${step} de ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 rounded-full w-6 sm:w-10",
            i + 1 < step ? "bg-ok" : i + 1 === step ? "bg-brand" : "bg-surface-2",
          )}
        />
      ))}
    </div>
  );
}

/** Full-screen flow header: back · title/sub · dots · right slot. */
export function FlowHeader({
  title,
  sub,
  step,
  total,
  backHref,
  right,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  step: number;
  total: number;
  backHref: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="ui-safe-top shrink-0 bg-surface border-b border-line">
      <div className="h-[var(--h-head)] flex items-center gap-3 sm:gap-4 px-4 sm:px-7">
        <Link
          href={backHref}
          aria-label="Volver"
          className="size-12 min-h-12 shrink-0 rounded-btn border border-line bg-surface text-text flex items-center justify-center hover:bg-surface-2"
        >
          <ArrowLeft size={22} aria-hidden />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="ui-h2 truncate">{title}</h1>
          {sub ? <p className="ui-sub truncate m-0">{sub}</p> : null}
        </div>
        <div className="hidden sm:block">
          <StepDots step={step} total={total} />
        </div>
        {right}
      </div>
      <div className="sm:hidden px-4 pb-2.5">
        <StepDots step={step} total={total} />
      </div>
    </header>
  );
}

/** 8 px brand progress bar. `value` is 0–1. */
export function ProgressBar({ value, label, className }: { value: number; label: string; className?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn("h-2 rounded-full bg-surface-2 overflow-hidden", className)}
    >
      <span className="block h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
    </div>
  );
}
