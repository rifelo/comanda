import * as React from "react";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "ghost" | "strong" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-brand text-on-brand border border-transparent hover:brightness-[0.97]",
  ghost: "bg-surface text-text border border-line hover:bg-surface-2",
  strong: "bg-strong text-on-strong border border-transparent hover:opacity-90",
  danger: "bg-late text-white border border-transparent hover:brightness-[0.95]",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-12 min-h-12 px-[18px] text-[15px] rounded-btn",
  md: "h-14 min-h-14 px-6 text-[17px] rounded-btn",
  lg: "h-[72px] min-h-[72px] px-7 text-[20px] rounded-[14px]",
};

export function buttonClass({
  variant = "primary",
  size = "md",
  block,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
}) {
  return cn(
    "inline-flex items-center justify-center gap-2.5 font-bold whitespace-nowrap no-underline cursor-pointer select-none",
    "transition-[filter,background-color,opacity,transform] active:translate-y-px",
    "disabled:opacity-40 disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:pointer-events-none",
    VARIANT[variant],
    SIZE[size],
    block && "w-full",
    className,
  );
}

type Common = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
};

type AsButton = Common & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & { href?: undefined };
type AsLink = Common & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "children" | "href"> & {
  href: string;
  prefetch?: boolean;
};

/**
 * Primary action is brand yellow; `ghost` = white with a hairline; `strong` =
 * black; `danger` = red. With `href` it renders a next/link.
 */
export function Button(props: AsButton | AsLink) {
  const { variant, size, block, loading, icon, className, children, ...rest } = props;
  const cls = buttonClass({ variant, size, block, className });
  const inner = (
    <>
      {loading ? <LoaderCircle size={20} className="animate-spin" aria-hidden /> : icon}
      {children}
    </>
  );
  if (typeof rest.href === "string") {
    const { href, ...a } = rest as AsLink;
    return (
      <Link href={href} className={cls} {...a}>
        {inner}
      </Link>
    );
  }
  const b = rest as Omit<AsButton, keyof Common>;
  return (
    <button type="button" className={cls} aria-busy={loading || undefined} {...b} disabled={b.disabled || loading}>
      {inner}
    </button>
  );
}

type IconButtonProps = {
  label: string;
  size?: "sm" | "md";
  href?: string;
  className?: string;
  children: React.ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">;

/** Square 48 px (sm: 44 px) icon button with an accessible label. */
export function IconButton({ label, size = "md", href, className, children, ...rest }: IconButtonProps) {
  const cls = cn(
    "inline-flex items-center justify-center shrink-0 rounded-btn border border-line bg-surface text-text",
    "hover:bg-surface-2 cursor-pointer no-underline",
    size === "md" ? "size-12 min-h-12" : "size-11 min-h-11",
    className,
  );
  if (href) {
    return (
      <Link href={href} aria-label={label} title={label} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" aria-label={label} title={label} className={cls} {...rest}>
      {children}
    </button>
  );
}
