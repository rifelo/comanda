import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Combine Tailwind class names safely (used by every component). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a Date / ISO string as HH:mm in the given IANA timezone. */
export function formatTime(value: Date | string, timezone = "America/Bogota") {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  }).format(date);
}

/**
 * "HH:MM" (24 h) wall clock in a given timezone. Numeric parts only, so the
 * server and the browser agree (no locale month names → no hydration drift).
 */
export function nowInTz(timezone = "America/Bogota", at = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const h = parts.find((p) => p.type === "hour")?.value ?? "00";
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${h}:${m}`;
}

/** YYYY-MM-DD in a given timezone — used for "today's shift" lookups. */
export function todayInTz(timezone = "America/Bogota", at = new Date()) {
  // en-CA produces YYYY-MM-DD reliably across browsers/runtimes.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

const SHORT_WEEKDAYS = ["DOM", "LUN", "MAR", "MIE", "JUE", "VIE", "SAB"] as const;
const LONG_WEEKDAYS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
] as const;
const SHORT_MONTHS = [
  "ENE", "FEB", "MAR", "ABR", "MAY", "JUN",
  "JUL", "AGO", "SEP", "OCT", "NOV", "DIC",
] as const;

/**
 * Format a YYYY-MM-DD into a short or long Spanish label.
 *  - "short" → "LUN 12·MAY"   (used on /today, /shift)
 *  - "long"  → "Lunes 12·MAY" (used on /dashboard)
 *
 * Uses UTC so the printed day/month never drifts from the YYYY-MM-DD the
 * server stored — the date is already timezone-normalized upstream by
 * `todayInTz`.
 */
export function formatDateLabelEs(
  yyyyMMdd: string,
  variant: "short" | "long" = "short",
): string {
  const [y, m, d] = yyyyMMdd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const wk =
    variant === "long"
      ? LONG_WEEKDAYS[dt.getUTCDay()]
      : SHORT_WEEKDAYS[dt.getUTCDay()];
  return `${wk} ${d}·${SHORT_MONTHS[m - 1]}`;
}
