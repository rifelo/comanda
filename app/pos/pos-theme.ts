"use client";

/**
 * Dark mode is the app's global theme (cookie `comanda-theme` → <html
 * data-theme>), not a POS setting: the «⋯» toggle flips it for every screen.
 * The POS root carries `.app.dark` / `.app.light` from here; before
 * hydration pos.css reads data-theme and the OS directly, so there is no flash.
 */
import * as React from "react";
import { applyThemeInBrowser } from "@/lib/theme";

function read(): boolean {
  const t = document.documentElement.dataset.theme;
  if (t === "oscuro") return true;
  if (t === "claro") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function subscribe(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  return () => {
    mo.disconnect();
    mq.removeEventListener("change", cb);
  };
}

/** null on the server (pos.css decides), then the real value. */
export function useIsDark(): boolean | null {
  return React.useSyncExternalStore(subscribe, read, () => null);
}

/** «Modo oscuro» in the «⋯» menu: an explicit choice, saved for the whole app. */
export function setDark(dark: boolean) {
  applyThemeInBrowser(dark ? "oscuro" : "claro");
}

/** Root class for the POS: `app pos` + dark/light once known. */
export function useAppClass(): string {
  const dark = useIsDark();
  return "app pos" + (dark === null ? "" : dark ? " dark" : " light");
}
