"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/** Step that makes sense for a recipe unit: 5 g / 5 ml, 1 und, 0,05 kg / L. */
export function pasoDe(unit: string): number {
  const u = unit.trim().toLowerCase();
  if (u === "g" || u === "ml") return 5;
  if (u === "kg" || u === "l") return 0.05;
  return 1;
}

const fmt = (n: number) => String(Math.round(n * 1000) / 1000).replace(".", ",");
const parse = (t: string): number | null => {
  const s = t.trim().replace(",", ".");
  if (!s || !/^\d*\.?\d*$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/**
 * − qty + for recipe lines (44 px buttons). Keeps the typed text while the
 * field has focus so «0,15» can be typed (components/ui Counter coerces on
 * every keystroke); `onChange` fires with each valid positive number.
 */
export function QtyInput({ value, onChange, unit, label, disabled }: { value: number; onChange: (n: number) => void; unit: string; label: string; disabled?: boolean }) {
  const [text, setText] = React.useState(fmt(value));
  const [focus, setFocus] = React.useState(false);
  const shown = focus ? text : fmt(value);
  const step = pasoDe(unit);
  const btn = "size-11 min-h-11 shrink-0 rounded-btn border border-line bg-surface text-text flex items-center justify-center cursor-pointer hover:bg-surface-2 disabled:opacity-40";
  const bump = (dir: 1 | -1) => {
    const base = Math.round(value / step) * step;
    const next = Math.round((dir === 1 ? (base > value ? base : base + step) : base < value ? base : base - step) * 1000) / 1000;
    if (next > 0) onChange(next);
  };
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={label}>
      <button type="button" className={btn} aria-label={`Menos ${label}`} disabled={disabled || value - step <= 0} onClick={() => bump(-1)}>
        <Minus size={18} aria-hidden />
      </button>
      <input
        inputMode="decimal"
        aria-label={label}
        value={shown}
        disabled={disabled}
        onFocus={(e) => {
          setText(fmt(value));
          setFocus(true);
          e.currentTarget.select();
        }}
        onBlur={() => setFocus(false)}
        onChange={(e) => {
          setText(e.target.value);
          const n = parse(e.target.value);
          if (n !== null && n > 0) onChange(Math.round(n * 1000) / 1000);
        }}
        className={cn("w-[72px] h-11 rounded-btn border border-line bg-surface-2 text-text text-center text-lg font-bold ui-num font-[inherit]")}
      />
      <button type="button" className={btn} aria-label={`Más ${label}`} disabled={disabled} onClick={() => bump(1)}>
        <Plus size={18} aria-hidden />
      </button>
    </div>
  );
}
