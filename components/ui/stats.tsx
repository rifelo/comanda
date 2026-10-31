import * as React from "react";
import Link from "next/link";
import { posMoney } from "@/lib/pos/types";
import { cn } from "@/lib/utils";

/** COP amount, deterministic formatting (SSR-safe). `signed` adds + / −. */
export function Money({ value, signed, className }: { value: number; signed?: boolean; className?: string }) {
  const sign = signed ? (value > 0 ? "+ " : value < 0 ? "− " : "") : value < 0 ? "− " : "";
  return <span className={cn("ui-num", className)}>{sign + posMoney(Math.abs(value)).replace("$", "$ ")}</span>;
}

/** Big headline number with its label («Debería haber en caja»). */
export function BigNumber({
  label,
  value,
  sub,
  size = "lg",
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span className="ui-label">{label}</span>
      <span className={cn("font-bold ui-num leading-none tracking-[-0.02em]", size === "lg" ? "text-[40px] sm:text-[48px]" : "text-[32px]")}>
        {value}
      </span>
      {sub ? <span className="ui-sub">{sub}</span> : null}
    </div>
  );
}

/** Compact KPI tile (Hoy del dueño). `delta` is free text («+12 % vs ayer»). */
export function StatTile({
  label,
  value,
  delta,
  tone = "neutral",
  href,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  delta?: React.ReactNode;
  tone?: "neutral" | "ok" | "late";
  href?: string;
  className?: string;
}) {
  const inner = (
    <>
      <span className="ui-label">{label}</span>
      <span className="text-[26px] font-bold ui-num leading-tight">{value}</span>
      {delta ? (
        <span className={cn("text-[13px] font-semibold", tone === "ok" ? "text-ok" : tone === "late" ? "text-late" : "text-muted")}>
          {delta}
        </span>
      ) : null}
    </>
  );
  const cls = cn("bg-surface border border-line rounded-card px-4 py-3.5 flex flex-col gap-1 min-w-0 text-text no-underline", className);
  return href ? (
    <Link href={href} className={cn(cls, "hover:bg-surface-2")}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
