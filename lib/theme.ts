/**
 * App appearance (docs/redesign/PLAN.md §5.1).
 *
 * The `comanda-theme` cookie now holds `claro | oscuro | auto`. Older cookies
 * (and `restaurants.theme` in the DB, which is not migrated) still carry the
 * five paper themes: `carbon` was the dark one, every other paper theme is
 * light. Pure module — safe on server and client.
 */
export type AppTheme = "claro" | "oscuro" | "auto";

export const THEME_COOKIE = "comanda-theme";
export const APP_THEMES: readonly AppTheme[] = ["claro", "oscuro", "auto"];

/**
 * Theme used when there is no cookie: follow the OS. Every screen paints
 * with tokens since the redesign (Ola 3 checked for hard-coded light
 * colours); the public menu keeps its own palette.
 */
export const DEFAULT_THEME: AppTheme = "auto";

const LEGACY: Record<string, AppTheme> = {
  papel: "claro",
  sepia: "claro",
  indigo: "claro",
  rojo: "claro",
  carbon: "oscuro",
};

/** Normalise any stored value (cookie or DB) to an AppTheme. */
export function toAppTheme(raw: string | null | undefined, fallback: AppTheme = DEFAULT_THEME): AppTheme {
  if (!raw) return fallback;
  if ((APP_THEMES as readonly string[]).includes(raw)) return raw as AppTheme;
  return LEGACY[raw] ?? fallback;
}

/** Browser chrome colour (`<meta name="theme-color">`) per theme token `--bg`. */
export const THEME_COLOR = { claro: "#f5f5f4", oscuro: "#121212" } as const;

export const THEME_LABELS: Record<AppTheme, string> = {
  claro: "Claro",
  oscuro: "Oscuro",
  auto: "Automático",
};

/**
 * Client-side switch: write the cookie (1 year, readable by the root layout
 * on the next request) and flip `<html data-theme>` right away.
 */
export function applyThemeInBrowser(theme: AppTheme): void {
  if (typeof document === "undefined") return;
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  document.documentElement.dataset.theme = theme;
}
