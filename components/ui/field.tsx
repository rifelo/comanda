"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

const CONTROL =
  "w-full rounded-btn border border-line bg-surface text-text font-[inherit] text-[17px] placeholder:text-muted " +
  "focus-visible:outline-[3px] focus-visible:outline-[var(--focus)] focus-visible:outline-offset-2 " +
  "disabled:opacity-50 aria-[invalid=true]:border-late";

function Wrap({
  id,
  label,
  hint,
  error,
  className,
  children,
}: {
  id: string;
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label ? (
        <label htmlFor={id} className="ui-label">
          {label}
        </label>
      ) : null}
      {children}
      {error ? (
        <p id={`${id}-err`} className="m-0 text-sm font-semibold text-late">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="m-0 ui-sub">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type FieldProps = {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  className?: string;
  inputClassName?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "className">;

/** 56 px text input with label, hint and error. */
export const Field = React.forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, error, className, inputClassName, id, ...rest },
  ref,
) {
  const auto = React.useId();
  const fid = id ?? auto;
  return (
    <Wrap id={fid} label={label} hint={hint} error={error} className={className}>
      <input
        ref={ref}
        id={fid}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fid}-err` : hint ? `${fid}-hint` : undefined}
        className={cn(CONTROL, "h-14 px-4", inputClassName)}
        {...rest}
      />
    </Wrap>
  );
});

type TextAreaProps = {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  className?: string;
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "className">;

export const TextArea = React.forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { label, hint, error, className, id, ...rest },
  ref,
) {
  const auto = React.useId();
  const fid = id ?? auto;
  return (
    <Wrap id={fid} label={label} hint={hint} error={error} className={className}>
      <textarea
        ref={ref}
        id={fid}
        aria-invalid={error ? true : undefined}
        className={cn(CONTROL, "min-h-[140px] px-4 py-3.5 resize-none leading-[1.45]")}
        {...rest}
      />
    </Wrap>
  );
});

/** Search input with icon and clear button. Controlled. */
export function SearchField({
  value,
  onChange,
  placeholder = "Buscar",
  label = "Buscar",
  className,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search size={20} aria-hidden className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
      <input
        type="search"
        aria-label={label}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        className={cn(CONTROL, "h-14 pl-12 pr-12 [&::-webkit-search-cancel-button]:appearance-none")}
      />
      {value ? (
        <button
          type="button"
          aria-label="Borrar búsqueda"
          onClick={() => onChange("")}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 size-11 min-h-11 rounded-btn flex items-center justify-center text-muted hover:text-text bg-transparent border-0 cursor-pointer"
        >
          <X size={20} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
