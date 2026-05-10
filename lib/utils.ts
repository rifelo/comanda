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
