"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const MINUTE = 60_000;
const subscribe = (cb: () => void) => {
  // Re-render on the next minute boundary, then every minute.
  let interval: ReturnType<typeof setInterval> | undefined;
  const timeout = setTimeout(() => {
    cb();
    interval = setInterval(cb, MINUTE);
  }, MINUTE - (Date.now() % MINUTE) + 50);
  return () => {
    clearTimeout(timeout);
    if (interval) clearInterval(interval);
  };
};
const currentMinute = () => Math.floor(Date.now() / MINUTE) * MINUTE;

/**
 * "H:MM" in `tz`, built from numeric parts only (no locale strings) so Node
 * and the browser print the same thing — see the SSR-date memory.
 */
export function formatClock(ms: number, tz = "America/Bogota"): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${h}:${m.padStart(2, "0")}`;
}

/**
 * Live clock. The server passes `serverNow` (ms) so SSR and hydration render
 * the same minute; afterwards it follows the device clock.
 */
export function Clock({ tz = "America/Bogota", serverNow, className }: { tz?: string; serverNow: number; className?: string }) {
  const serverMinute = Math.floor(serverNow / MINUTE) * MINUTE;
  const now = React.useSyncExternalStore(subscribe, currentMinute, () => serverMinute);
  return (
    <span className={cn("text-[22px] font-bold ui-num", className)} suppressHydrationWarning>
      {formatClock(now, tz)}
    </span>
  );
}
