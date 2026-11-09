import { body, display } from "@/app/menu/fonts";

/** The menu lives at the root of the café's own domain, whatever host served this page. */
export const MENU = "https://cafepayo.com";
export const BASE = "/menu/puntos";
export const LOGO = "/menu/art/cafe-payo-logo-principal.svg";

type Tab = "inicio" | "insights" | "ranking" | "escanear";

const ICONOS: Record<Tab, React.ReactNode> = {
  inicio: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  insights: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  ranking: <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" />,
  escanear: <QrPath />,
};

function QrPath() {
  return (
    <>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3" />
    </>
  );
}

export function Icono({ tab, size = 22 }: { tab: Tab; size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {ICONOS[tab]}
    </svg>
  );
}

const TABS: { tab: Tab; label: string; href: string }[] = [
  { tab: "inicio", label: "Inicio", href: BASE },
  { tab: "insights", label: "Insights", href: `${BASE}/insights` },
  { tab: "ranking", label: "Ranking", href: `${BASE}/ranking` },
  { tab: "escanear", label: "Escanear", href: `${BASE}/escanear` },
];

/** A screen of the app: yellow bar with the logo and the @, content, bottom tabs. */
export function Pantalla({ instagram, tab, tono = "crema", children }: { instagram: string; tab: Tab; tono?: "crema" | "oscuro"; children: React.ReactNode }) {
  return (
    <div className={`pyy ${tono === "oscuro" ? "pyy--oscuro" : ""}`}>
      <header className="pyy-top">
        <a href={MENU} aria-label="Café Pa' Yo, ir al menú">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO} alt="Café Pa' Yo" className="pyy-top__logo" />
        </a>
        <div className="pyy-top__yo">
          <span>@{instagram}</span>
          <span className="pyy-ava" aria-hidden="true">{instagram.replace(/[^a-z0-9]/g, "").charAt(0) || "@"}</span>
        </div>
      </header>
      <main className="pyy-main">{children}</main>
      <nav className="pyy-nav" aria-label="Principal">
        {TABS.map((t) => (
          <a key={t.tab} href={t.href} aria-current={t.tab === tab ? "page" : undefined}>
            <Icono tab={t.tab} />
            {t.label}
          </a>
        ))}
      </nav>
    </div>
  );
}

/** Fonts + tokens for pages that sit outside the menu layout (the QR page). */
export const fuentes = `pym ${display.variable} ${body.variable}`;
