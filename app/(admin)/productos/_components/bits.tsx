/**
 * Small shared pieces for the owner's Productos and Inventario screens (P4):
 * a native select styled like `Field`, number formatting and the margin pill.
 * Presentational only — tokens from app/globals.css, no inline `display`.
 */
import * as React from "react";
import { MARGEN_MIN } from "@/lib/cost";
import { posMoney } from "@/lib/pos/types";
import { cn } from "@/lib/utils";
import { Pill } from "@/components/ui/pill";

export const CONTROL_CLS =
  "w-full h-14 min-h-14 rounded-btn border border-line bg-surface text-text font-[inherit] text-[17px] px-4 " +
  "focus-visible:outline-[3px] focus-visible:outline-[var(--focus)] focus-visible:outline-offset-2 disabled:opacity-50 aria-[invalid=true]:border-late";

/** «$ 8.500» — deterministic (SSR-safe). Decimals for per-unit costs below $100. */
export function pesos(n: number, opts: { unit?: boolean } = {}): string {
  if (opts.unit && Math.abs(n) < 100 && !Number.isInteger(n)) {
    return "$ " + (Math.round(n * 100) / 100).toString().replace(".", ",");
  }
  return posMoney(n).replace("$", n < 0 ? "− $ " : "$ ").replace("$ -", "$ ");
}

/** «0,15», «230», «1.250» — quantities with a comma decimal. */
export function cantidad(n: number): string {
  const r = Math.round(n * 1000) / 1000;
  const [ent, dec] = String(Math.abs(r)).split(".");
  const grouped = ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (r < 0 ? "−" : "") + grouped + (dec ? "," + dec : "");
}

export function Select({
  id,
  label,
  hint,
  error,
  className,
  children,
  ...rest
}: { id: string; label?: React.ReactNode; hint?: React.ReactNode; error?: React.ReactNode; className?: string } & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "className" | "id">) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label ? (
        <label htmlFor={id} className="ui-label">
          {label}
        </label>
      ) : null}
      <select id={id} aria-invalid={error ? true : undefined} className={cn(CONTROL_CLS, "cursor-pointer")} {...rest}>
        {children}
      </select>
      {error ? <p className="m-0 text-sm font-semibold text-late">{error}</p> : hint ? <p className="m-0 ui-sub">{hint}</p> : null}
    </div>
  );
}

/** «62 %» green when it passes the 55 % rule, red when not; «Sin precio» at 0. */
export function MargenPill({ margen, price, className }: { margen: number; price: number; className?: string }) {
  if (!(price > 0)) return <Pill tone="late" className={className}>Sin precio</Pill>;
  return (
    <Pill tone={margen >= MARGEN_MIN ? "ok" : "late"} className={className}>
      <span className="ui-num">{margen} %</span>
    </Pill>
  );
}

/** Section title inside a page (h2 + optional sub and right slot). */
export function SectionTitle({ id, title, sub, right }: { id?: string; title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-end gap-3">
      <div className="flex-1 min-w-0">
        <h2 id={id} className="ui-h2 m-0">
          {title}
        </h2>
        {sub ? <p className="ui-sub m-0 mt-1">{sub}</p> : null}
      </div>
      {right}
    </div>
  );
}

/** Square product thumbnail or initials. */
export function Thumb({ src, name, size = 48 }: { src: string | null; name: string; size?: 40 | 48 | 64 | 88 }) {
  const sz = size === 40 ? "size-10" : size === 48 ? "size-12" : size === 64 ? "size-16" : "size-[88px]";
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className={cn(sz, "shrink-0 rounded-btn object-cover bg-surface-2")} />;
  }
  const ini = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <span aria-hidden className={cn(sz, "shrink-0 rounded-btn bg-surface-2 text-muted font-bold flex items-center justify-center", size >= 64 ? "text-xl" : "text-sm")}>
      {ini}
    </span>
  );
}
