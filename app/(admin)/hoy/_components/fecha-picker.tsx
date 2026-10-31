"use client";

import { useRouter } from "next/navigation";

/**
 * Jump to any past day. The date lives in the path (a different route, not
 * just a changed query), so a plain push works — never inside a transition.
 */
export function FechaPicker({ date, today }: { date: string; today: string }) {
  const router = useRouter();
  return (
    <input
      type="date"
      aria-label="Ver otro día"
      value={date}
      max={today}
      onChange={(e) => {
        const v = e.target.value;
        if (!v || v > today) return;
        router.push(v === today ? "/hoy" : `/hoy/${v}`);
      }}
      className="ui-num h-11 min-h-11 rounded-btn border border-line bg-surface text-text px-3 text-[15px] font-semibold"
    />
  );
}
