"use client";

import { useRouter } from "next/navigation";

/** Jump to any past day. The date lives in the path, so it is a plain push. */
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
        router.push(v === today ? "/numeros" : `/numeros/${v}`);
      }}
      className="cmd-num"
      style={{
        fontFamily: "var(--font-mono), ui-monospace, monospace",
        height: 32,
        padding: "0 8px",
        border: "1px solid var(--ink)",
        borderRadius: 2,
        background: "transparent",
        color: "var(--ink)",
      }}
    />
  );
}
