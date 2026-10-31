"use client";

import * as React from "react";
import { Segmented } from "@/components/ui/segmented";
import { APP_THEMES, THEME_LABELS, applyThemeInBrowser, toAppTheme, type AppTheme } from "@/lib/theme";

/**
 * Claro / Oscuro / Automático. Writes the cookie and flips `<html
 * data-theme>` immediately — no server round-trip. Only mount on the client
 * (inside a Sheet), it reads the current theme from the document.
 */
export function ThemeSwitcher({ className }: { className?: string }) {
  const [theme, setTheme] = React.useState<AppTheme>(() =>
    toAppTheme(typeof document === "undefined" ? null : document.documentElement.dataset.theme),
  );
  return (
    <Segmented<AppTheme>
      label="Apariencia"
      block
      className={className}
      value={theme}
      onChange={(t) => {
        setTheme(t);
        applyThemeInBrowser(t);
      }}
      options={APP_THEMES.map((t) => ({ value: t, label: THEME_LABELS[t] }))}
    />
  );
}
