import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { AppLogo } from "@/components/ui/top-bar";
import { buttonClass } from "@/components/ui/button";

/**
 * «Sin conexión» — precached by public/sw.js and served for any navigation
 * that fails offline. Fully static (no session, no data) and excluded from
 * the proxy matcher, so it renders the same for everyone.
 *
 * No client JS on purpose: the page may be shown before any chunk is cached.
 * «Reintentar» is a link to the current URL (`href=""`), which the browser
 * reloads — the URL bar still holds the page the person wanted.
 */
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Sin conexión · Comanda",
  robots: { index: false },
};

export default function OfflinePage() {
  return (
    <main className="min-h-dvh flex items-center justify-center bg-bg text-text px-4 py-10 ui-safe-top ui-safe-bottom">
      <div className="w-full max-w-[480px] bg-surface border border-line rounded-card p-6 sm:p-8 flex flex-col items-center text-center gap-5">
        <AppLogo size={56} />
        <span className="size-14 rounded-full bg-surface-2 flex items-center justify-center">
          <WifiOff size={28} aria-hidden />
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="ui-h1 m-0">Sin conexión</h1>
          <p className="ui-sub m-0 text-base">
            Este dispositivo no tiene internet. Revisa el wifi o los datos y vuelve a intentar.
          </p>
        </div>
        <div className="w-full flex flex-col gap-2.5">
          <a href="" className={buttonClass({ block: true })}>
            Reintentar
          </a>
          {/* Full navigation (not next/link) so pos-sw.js can answer offline. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/pos" className={buttonClass({ variant: "ghost", block: true })}>
            Abrir el punto de venta
          </a>
        </div>
        <p className="ui-sub m-0">El punto de venta sigue vendiendo sin internet si ya se abrió antes en este dispositivo.</p>
      </div>
    </main>
  );
}
