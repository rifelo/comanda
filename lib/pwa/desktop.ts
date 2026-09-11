"use client";

/**
 * Desktop-app state for the register: install prompt, display mode, full
 * screen. One tiny store (same pattern as app/pos/pos-store.ts) read through
 * useSyncExternalStore, wired to the browser events once via
 * `useDesktopAppEvents()` at the terminal root.
 *
 *  · `canInstall` — Chrome/Edge fired `beforeinstallprompt`; we stash the
 *    event and replay it from a click (`installApp`). Only fires when the
 *    manifest passes the installability checks and the app isn't installed.
 *  · `standalone` — running inside the installed window (or an `--app=`
 *    window), per the `display-mode` media query.
 *  · `fullscreen` — `document.fullscreenElement` is set. `requestFullscreen`
 *    needs a user gesture; the top-bar chip provides it. F11 works too.
 */

import * as React from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface DesktopAppState {
  canInstall: boolean;
  standalone: boolean;
  fullscreen: boolean;
  /** True once `beforeinstallprompt` support is known one way or the other. */
  ready: boolean;
}

const INITIAL: DesktopAppState = { canInstall: false, standalone: false, fullscreen: false, ready: false };

let state = INITIAL;
const subs = new Set<() => void>();
function set(patch: Partial<DesktopAppState>) {
  state = { ...state, ...patch };
  subs.forEach((f) => f());
}
function sub(f: () => void) {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
}

export function useDesktopApp(): DesktopAppState {
  return React.useSyncExternalStore(sub, () => state, () => INITIAL);
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

const STANDALONE_QUERY = "(display-mode: standalone), (display-mode: fullscreen), (display-mode: window-controls-overlay)";

function readDisplayMode(): boolean {
  return typeof window !== "undefined" && window.matchMedia(STANDALONE_QUERY).matches;
}

/** Mount once. Idempotent per page load. */
export function useDesktopAppEvents() {
  React.useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault(); // keep the mini-infobar quiet; we show our own button
      deferredPrompt = e as BeforeInstallPromptEvent;
      set({ canInstall: true, ready: true });
    };
    const onInstalled = () => {
      deferredPrompt = null;
      set({ canInstall: false });
    };
    const mq = window.matchMedia(STANDALONE_QUERY);
    const onDisplay = () => set({ standalone: mq.matches });
    const onFullscreen = () => set({ fullscreen: !!document.fullscreenElement });

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    mq.addEventListener("change", onDisplay);
    document.addEventListener("fullscreenchange", onFullscreen);
    set({ standalone: readDisplayMode(), fullscreen: !!document.fullscreenElement, ready: true });

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      mq.removeEventListener("change", onDisplay);
      document.removeEventListener("fullscreenchange", onFullscreen);
    };
  }, []);
}

/** Replay the browser's install prompt. Must be called from a click. */
export async function installApp(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const ev = deferredPrompt;
  if (!ev) return "unavailable";
  await ev.prompt();
  const { outcome } = await ev.userChoice;
  if (outcome === "accepted") {
    deferredPrompt = null;
    set({ canInstall: false });
  }
  return outcome;
}

/** Toggle full screen on the document. Must be called from a click. */
export async function toggleFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen({ navigationUI: "hide" });
  } catch (err) {
    console.warn("[desktop] fullscreen:", err);
  }
}
