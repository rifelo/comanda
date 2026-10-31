"use client";

import { useIsClient } from "@/components/ui";
import { ThemeSwitcher } from "@/components/shell/theme-switcher";

/**
 * ThemeSwitcher reads the current theme from `<html data-theme>`, which the
 * server render cannot see — mount it after hydration (a same-size
 * placeholder first) so the pressed option never mismatches.
 */
export function Tema() {
  const client = useIsClient();
  return client ? <ThemeSwitcher /> : <div aria-hidden className="h-[52px] rounded-btn bg-surface-2" />;
}
