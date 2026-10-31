import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "./avatar";
import { Clock } from "./clock";

/** The app mark (hand-and-cup tile) — 40 px. */
export function AppLogo({ size = 40, href, className }: { size?: number; href?: string; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  const img = <img src="/icons/icon.svg" alt="Café PA'YO" width={size} height={size} className={cn("block rounded-[10px] shrink-0", className)} />;
  return href ? (
    <Link href={href} aria-label="Inicio" className="shrink-0 flex items-center">
      {img}
    </Link>
  ) : (
    img
  );
}

/**
 * App header (56 px phone / 76 px ≥ 640): logo · title + sub · actions ·
 * who (avatar + name) · clock. `who` can be a button (pass `onWho` from a
 * client parent) — otherwise it is static.
 */
export function TopBar({
  title,
  sub,
  logo = true,
  logoHref,
  actions,
  who,
  whoSlot,
  clock,
  className,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  logo?: boolean;
  logoHref?: string;
  actions?: React.ReactNode;
  who?: { name: string; initials?: string };
  /** Replaces the static `who` (e.g. a profile-sheet trigger). */
  whoSlot?: React.ReactNode;
  clock?: { tz?: string; serverNow: number };
  className?: string;
}) {
  return (
    <header className={cn("ui-safe-top shrink-0 bg-surface border-b border-line", className)}>
      <div className="h-[var(--h-head)] flex items-center gap-3 sm:gap-4 px-4 sm:px-7">
        {logo ? <AppLogo href={logoHref} size={36} /> : null}
        <div className="flex-1 min-w-0">
          <h1 className="ui-h2 m-0 truncate">{title}</h1>
          {sub ? <p className="m-0 text-sm text-muted truncate">{sub}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
        {whoSlot ??
          (who ? (
            <span className="flex items-center gap-2.5 text-[15px] font-semibold shrink-0">
              <Avatar name={who.name} initials={who.initials} />
              <span className="hidden sm:inline">{who.name}</span>
            </span>
          ) : null)}
        {clock ? <Clock tz={clock.tz} serverNow={clock.serverNow} className="hidden sm:inline" /> : null}
      </div>
    </header>
  );
}

/** In-page title block for content screens: back · title/sub · actions. */
export function PageHeader({
  title,
  sub,
  back,
  actions,
  className,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  back?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3 sm:gap-4 px-4 sm:px-7 pt-5 pb-4", className)}>
      {back ? (
        <Link
          href={back}
          aria-label="Volver"
          className="size-11 min-h-11 shrink-0 rounded-btn border border-line bg-surface text-text flex items-center justify-center hover:bg-surface-2"
        >
          <ArrowLeft size={20} aria-hidden />
        </Link>
      ) : null}
      <div className="flex-1 min-w-[200px]">
        <h1 className="ui-h1 m-0">{title}</h1>
        {sub ? <p className="ui-sub m-0 mt-1">{sub}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
