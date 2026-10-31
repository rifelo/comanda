"use client";

import * as React from "react";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type Tone = "neutral" | "ok" | "late" | "brand";

const TONE_BOX: Record<Tone, string> = {
  neutral: "bg-surface-2 text-text",
  ok: "bg-ok-soft text-ok",
  late: "bg-late-soft text-late",
  brand: "bg-brand-soft text-text",
};

function ToneIcon({ tone }: { tone: Tone }) {
  if (tone === "ok") return <CircleCheck size={20} aria-hidden className="shrink-0" />;
  if (tone === "late") return <CircleAlert size={20} aria-hidden className="shrink-0" />;
  return <Info size={20} aria-hidden className="shrink-0" />;
}

/** Nothing-here state: title, text, optional action. */
export function EmptyState({ title, text, action, className }: { title: React.ReactNode; text?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center text-center gap-2 py-10 px-4", className)}>
      <p className="ui-title m-0">{title}</p>
      {text ? <p className="ui-sub m-0 max-w-[420px]">{text}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

/** Inline banner (offline, error, info). */
export function Banner({
  tone = "neutral",
  onClose,
  className,
  children,
}: {
  tone?: Tone;
  onClose?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div role={tone === "late" ? "alert" : "status"} className={cn("flex items-start gap-3 rounded-btn px-4 py-3 text-[15px] font-semibold", TONE_BOX[tone], className)}>
      <ToneIcon tone={tone} />
      <div className="flex-1 min-w-0 pt-px">{children}</div>
      {onClose ? (
        <button type="button" onClick={onClose} aria-label="Cerrar aviso" className="-m-2 size-11 min-h-11 flex items-center justify-center bg-transparent border-0 text-current cursor-pointer">
          <X size={18} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

// ── Toast: tiny module store, rendered once by <Toaster/> in app/layout ──
type ToastItem = { id: number; message: React.ReactNode; tone: Tone };
let toasts: ToastItem[] = [];
let nextId = 1;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
};
const EMPTY: ToastItem[] = [];

export function toast(message: React.ReactNode, tone: Tone = "neutral", ms = 3200): void {
  const id = nextId++;
  toasts = [...toasts, { id, message, tone }].slice(-3);
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, ms);
}

/** `const show = useToast(); show("Guardado", "ok")` */
export function useToast(): typeof toast {
  return toast;
}

export function Toaster() {
  const items = React.useSyncExternalStore(subscribe, () => toasts, () => EMPTY);
  return (
    <div
      aria-live="polite"
      className="fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4 pointer-events-none"
      style={{ bottom: "calc(var(--h-tabs) + env(safe-area-inset-bottom) + 12px)" }}
    >
      {items.map((t) => (
        <div
          key={t.id}
          className={cn(
            "ui-anim-sheet pointer-events-auto max-w-[520px] w-full sm:w-auto flex items-center gap-2.5 rounded-btn px-4 py-3 text-[15px] font-semibold shadow-[var(--shadow-2)]",
            // Solid fills: the soft tones are translucent in dark mode.
            t.tone === "ok" ? "bg-ok text-on-strong" : t.tone === "late" ? "bg-late text-on-strong" : t.tone === "brand" ? "bg-brand text-on-brand" : "bg-strong text-on-strong",
          )}
        >
          {t.tone !== "neutral" ? <ToneIcon tone={t.tone} /> : null}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
