import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type CardProps = {
  tight?: boolean;
  as?: "section" | "div" | "article" | "aside";
  className?: string;
  children?: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, "className" | "children">;

/** White surface, 16 px radius, hairline border. `tight` = 16/18 padding. */
export function Card({ tight, as = "section", className, children, ...rest }: CardProps) {
  const Tag = as;
  return (
    <Tag
      className={cn(
        "bg-surface border border-line rounded-card flex flex-col",
        tight ? "px-[18px] py-4 gap-3" : "p-[18px] sm:p-[22px] gap-3.5",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

const TONE: Record<"neutral" | "late" | "ok", string> = {
  neutral: "bg-surface border-line",
  late: "bg-late-soft border-transparent",
  ok: "bg-ok-soft border-transparent",
};

/**
 * Whole-card link (≥ 76 px): optional icon, title, sub, badge and a chevron.
 * `external` opens in a new tab with a plain <a>.
 */
export function LinkCard({
  title,
  sub,
  href,
  badge,
  icon,
  tone = "neutral",
  external,
  className,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  href: string;
  badge?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "neutral" | "late" | "ok";
  external?: boolean;
  className?: string;
}) {
  const cls = cn(
    "flex items-center gap-3.5 min-h-[76px] px-5 py-[18px] rounded-card border text-text no-underline",
    "hover:brightness-[0.985] active:translate-y-px transition-[filter,transform]",
    TONE[tone],
    className,
  );
  const body = (
    <>
      {icon ? (
        <span className="size-11 shrink-0 rounded-btn bg-surface-2 flex items-center justify-center text-text">
          {icon}
        </span>
      ) : null}
      <span className="flex-1 min-w-0">
        <span className={cn("ui-title block", tone === "late" && "text-late")}>{title}</span>
        {sub ? <span className="ui-sub block mt-0.5 truncate">{sub}</span> : null}
      </span>
      {badge != null ? <span className="shrink-0">{badge}</span> : null}
      <ChevronRight size={20} strokeWidth={2.4} aria-hidden className="shrink-0 text-muted" />
    </>
  );
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {body}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {body}
    </Link>
  );
}
