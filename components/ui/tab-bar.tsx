"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/lib/nav/items";
import { activeTabFor } from "@/lib/nav/active";
import { cn } from "@/lib/utils";
import { NavIcon } from "./icon";

/**
 * Bottom tab bar (64 px phone / 84 px ≥ 640 + safe area). Active tab gets
 * the brand pill behind its icon. `current` overrides the pathname match.
 */
export function TabBar({
  items,
  current,
  extraMatch,
  className,
  label = "Secciones",
}: {
  items: NavItem[];
  current?: string;
  extraMatch?: Record<string, string[]>;
  className?: string;
  label?: string;
}) {
  const pathname = usePathname() ?? "";
  const active = current ?? activeTabFor(pathname, items, extraMatch)?.id;
  return (
    <nav aria-label={label} className={cn("ui-safe-bottom shrink-0 bg-surface border-t border-line", className)}>
      <div className="h-[var(--h-tabs)] flex items-stretch px-1 sm:px-5">
        {items.map((it) => {
          const on = it.id === active;
          return (
            <Link
              key={it.id}
              href={it.href}
              aria-current={on ? "page" : undefined}
              className={cn(
                "relative flex-1 min-w-0 flex flex-col items-center justify-center gap-1 no-underline text-xs sm:text-[13px] font-semibold",
                on ? "text-text" : "text-muted hover:text-text",
              )}
            >
              <span
                className={cn(
                  "w-14 sm:w-16 h-8 sm:h-[34px] rounded-full flex items-center justify-center",
                  on && "bg-brand text-on-brand",
                )}
              >
                <NavIcon name={it.icon} size={22} />
              </span>
              <span className="truncate max-w-full px-0.5">{it.label}</span>
              {it.badge ? (
                <span
                  aria-label={`${it.badge} pendientes`}
                  className="absolute top-1.5 sm:top-3 left-[calc(50%+12px)] min-w-5 h-5 px-1.5 rounded-full bg-late text-white text-xs font-bold flex items-center justify-center ui-num"
                >
                  {it.badge > 99 ? "99+" : it.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
