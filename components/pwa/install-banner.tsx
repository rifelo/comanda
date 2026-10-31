"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { ChevronRight, Download, Share, SquarePlus, X } from "lucide-react";
import { installApp, useDesktopApp, useDesktopAppEvents } from "@/lib/pwa/desktop";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * «Instalar en este dispositivo» (docs/redesign/PLAN.md §4).
 *  · Android / Chrome / Edge: replays `beforeinstallprompt` (lib/pwa/desktop).
 *  · iOS Safari (no such event): a sheet with the two manual steps.
 *  · Already installed (display-mode standalone): nothing to offer.
 */

const DISMISS_KEY = "comanda:install-dismissed";
const DISMISS_MS = 30 * 24 * 60 * 60 * 1000;
const DISMISS_EVENT = "comanda:install-dismissed";

/** Routes where the banner must never appear (POS has its own install chip). */
const NO_BANNER = ["/pos", "/menu", "/c/", "/privacidad", "/login", "/emparejar", "/offline", "/auth"];

const noop = () => () => {};

function detectIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iPadOs = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /iphone|ipad|ipod/i.test(ua) || iPadOs;
}

function iosStandalone(): boolean {
  return typeof navigator !== "undefined" && (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** True on iOS when not already launched from the home screen. */
function useIosInstallable(): boolean {
  return React.useSyncExternalStore(noop, () => detectIos() && !iosStandalone(), () => false);
}

function readDismissed(): boolean {
  try {
    const at = Number(window.localStorage.getItem(DISMISS_KEY) ?? "0");
    return Number.isFinite(at) && Date.now() - at < DISMISS_MS;
  } catch {
    return false;
  }
}

function subscribeDismiss(cb: () => void) {
  window.addEventListener(DISMISS_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(DISMISS_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** What this device can do right now. */
export function useInstallState() {
  const app = useDesktopApp();
  const ios = useIosInstallable();
  const installed = app.standalone || iosStandalone();
  return {
    installed,
    /** A one-tap prompt is available (Android/desktop Chromium). */
    canPrompt: app.canInstall && !installed,
    /** Manual steps needed (iOS Safari). */
    ios: ios && !installed,
  };
}

export function IosInstallSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Instalar en el iPhone o iPad" footer={<Button block onClick={onClose}>Entendido</Button>}>
      <ol className="m-0 p-0 list-none flex flex-col gap-4">
        <li className="flex items-center gap-4">
          <span className="size-12 shrink-0 rounded-btn bg-surface-2 flex items-center justify-center">
            <Share size={24} aria-hidden />
          </span>
          <span className="ui-title">
            1 · Toca <b>Compartir</b> en la barra de Safari.
          </span>
        </li>
        <li className="flex items-center gap-4">
          <span className="size-12 shrink-0 rounded-btn bg-surface-2 flex items-center justify-center">
            <SquarePlus size={24} aria-hidden />
          </span>
          <span className="ui-title">
            2 · Elige <b>Añadir a pantalla de inicio</b>.
          </span>
        </li>
      </ol>
      <p className="ui-sub m-0">Comanda queda como una app: se abre a pantalla completa desde el ícono.</p>
    </Sheet>
  );
}

/**
 * Link-card style button for «Más» and the profile sheet. Renders nothing
 * when the app is installed or the browser cannot install it.
 */
export function InstallLinkCard({ className }: { className?: string }) {
  const { canPrompt, ios } = useInstallState();
  const [iosOpen, setIosOpen] = React.useState(false);
  if (!canPrompt && !ios) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => (canPrompt ? void installApp() : setIosOpen(true))}
        className={cn(
          "w-full flex items-center gap-3.5 min-h-[76px] px-5 py-[18px] rounded-card border border-line bg-surface text-text text-left cursor-pointer hover:brightness-[0.985]",
          className,
        )}
      >
        <span className="size-11 shrink-0 rounded-btn bg-surface-2 flex items-center justify-center">
          <Download size={22} aria-hidden />
        </span>
        <span className="flex-1 min-w-0">
          <span className="ui-title block">Instalar en este dispositivo</span>
          <span className="ui-sub block mt-0.5">Abre Comanda como una app, sin el navegador</span>
        </span>
        <ChevronRight size={20} strokeWidth={2.4} aria-hidden className="shrink-0 text-muted" />
      </button>
      <IosInstallSheet open={iosOpen} onClose={() => setIosOpen(false)} />
    </>
  );
}

function InstallBannerInner() {
  useDesktopAppEvents();
  const { canPrompt, ios } = useInstallState();
  const dismissed = React.useSyncExternalStore(subscribeDismiss, readDismissed, () => true);
  const [iosOpen, setIosOpen] = React.useState(false);

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* private mode: the banner just comes back next visit */
    }
    window.dispatchEvent(new Event(DISMISS_EVENT));
  };

  if (dismissed || (!canPrompt && !ios)) return <IosInstallSheet open={iosOpen} onClose={() => setIosOpen(false)} />;

  return (
    <>
      <div
        role="region"
        aria-label="Instalar la app"
        className="fixed inset-x-3 z-40 mx-auto max-w-[520px] ui-anim-sheet flex items-center gap-3 rounded-card border border-line bg-surface text-text shadow-[var(--shadow-2)] pl-4 pr-1.5 py-2"
        style={{ bottom: "calc(var(--h-tabs) + env(safe-area-inset-bottom) + 12px)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon.svg" alt="" width={36} height={36} className="rounded-[9px] shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="m-0 text-[15px] font-semibold">Instala Comanda</p>
          <p className="m-0 text-[13px] text-muted truncate">Ábrela desde el inicio, a pantalla completa</p>
        </div>
        <Button
          size="sm"
          onClick={async () => {
            if (canPrompt) {
              const r = await installApp();
              if (r !== "unavailable") dismiss();
            } else setIosOpen(true);
          }}
        >
          Instalar
        </Button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Ahora no"
          className="size-11 min-h-11 shrink-0 rounded-btn flex items-center justify-center bg-transparent border-0 text-muted hover:text-text cursor-pointer"
        >
          <X size={20} aria-hidden />
        </button>
      </div>
      <IosInstallSheet open={iosOpen} onClose={() => setIosOpen(false)} />
    </>
  );
}

/**
 * First-visit install banner, mounted once in app/layout.tsx. Dismissal is
 * remembered for 30 days (localStorage). Never on the POS (it registers its
 * own app and listens to the install events itself) nor on public pages.
 */
export function InstallBanner() {
  const pathname = usePathname() ?? "";
  if (NO_BANNER.some((p) => pathname === p.replace(/\/$/, "") || pathname.startsWith(p.endsWith("/") ? p : p + "/"))) {
    return null;
  }
  return <InstallBannerInner />;
}
