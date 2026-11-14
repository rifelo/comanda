import { body, display } from "@/app/menu/fonts";
import { rachaDiasActual } from "@/lib/clientes/coleccion";
import { cargarCliente, cargarEscaneos } from "@/lib/clientes/mi-payo-db";
import { menuContent } from "@/lib/menu/data";

/** The café's landing (cafepayo.com "/") and its menu, whatever host served this page. */
export const HOME = "https://cafepayo.com";
export const MENU = "/menu";
export const BASE = "/menu/puntos";
export const LOGO = "/brand/payo-mark.svg";
/** The hand holding a cup (brand illustration). */
export const MANO = "/menu/art/mano-taza.svg";

type Tab = "inicio" | "coleccion" | "escanear" | "premios" | "ranking" | "insights" | "menu";

const ICONOS: Record<Tab, React.ReactNode> = {
  inicio: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  coleccion: <path d="M4 5h7v7H4zM13 5h7v7h-7zM4 14h7v6H4zM13 14h7v6h-7z" />,
  insights: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  ranking: <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" />,
  escanear: <QrPath />,
  premios: <path d="M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7c-1.5-4-6-4-6-1.5S9 7 12 7zM12 7c1.5-4 6-4 6-1.5S15 7 12 7z" />,
  menu: <path d="M5 4h14v16H5zM9 8h6M9 12h6M9 16h3" />,
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
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {ICONOS[tab]}
    </svg>
  );
}

/** Bottom tabs on a phone (five, «Escanear» raised in the middle); the same links head the sidebar on a wide screen. */
const TABS: { tab: Tab; label: string; href: string }[] = [
  { tab: "inicio", label: "Inicio", href: BASE },
  { tab: "coleccion", label: "Colección", href: `${BASE}/coleccion` },
  { tab: "escanear", label: "Escanear", href: `${BASE}/escanear` },
  { tab: "premios", label: "Premios", href: `${BASE}/premios` },
  { tab: "ranking", label: "Ranking", href: `${BASE}/ranking` },
];
/** Only on the wide-screen sidebar (a phone reaches them from Inicio). */
const EXTRA: { tab: Tab; label: string; href: string }[] = [
  { tab: "insights", label: "Estadísticas", href: `${BASE}/insights` },
  { tab: "menu", label: "Ver el menú", href: MENU },
];

/** Today's daily streak (days in a row with a drink) of a handle; 0 on any trouble. */
async function rachaDe(instagram: string): Promise<number> {
  try {
    const org = menuContent.organizationId;
    const cliente = await cargarCliente(org, instagram);
    return cliente ? rachaDiasActual(await cargarEscaneos(org, cliente.id)) : 0;
  } catch (e) {
    console.error("[Pantalla] racha", e);
    return 0;
  }
}

/** The streak in the top bar: a pill with the flame and the number (grey when there is none). */
function Fuego({ racha }: { racha: number }) {
  const label = racha > 0 ? `Racha de ${racha} ${racha === 1 ? "día seguido" : "días seguidos"} con café` : "Sin racha: un café hoy la empieza";
  return (
    <a href={`${BASE}/coleccion`} className={`pyy-fuego${racha > 0 ? "" : " pyy-fuego--apagado"}`} aria-label={label} title={label}>
      <svg aria-hidden="true" width="22" height="26" viewBox="0 0 48 56">
        <path className="pyy-fuego__llama" d="M24 2c3 9 17 14.5 17 31a17 17 0 0 1-34 0c0-7.5 3.4-12.8 7.4-16 .9 5.2 3.6 7.6 7 7.6C19.4 16.6 20.6 9 24 2z" />
        <path className="pyy-fuego__brasa" d="M24 24c2.2 4.8 9 7.8 9 16a9 9 0 0 1-18 0c0-4.6 2.2-7.6 4.4-9.4.5 2.9 2.2 4.2 4.1 4.2-.8-4-.5-7.5.5-10.8z" />
      </svg>
      <span className="pyy-fuego__n">{racha}</span>
    </a>
  );
}

/**
 * A screen of the app. Phone: me, my streak and the mark on top, content,
 * labelled tabs at the bottom. Wide screen (≥ 960px): the tabs become a left
 * sidebar and the content takes the rest. `ancho` lets the content use the
 * full width (Inicio, Colección); other screens stay a readable column.
 */
export async function Pantalla({ instagram, tab, ancho = false, children }: { instagram: string; tab: Tab; ancho?: boolean; children: React.ReactNode }) {
  const racha = await rachaDe(instagram);
  return (
    <div className="pyy pyy--app">
      <div className="pyy-cuerpo">
        <header className="pyy-top">
          <div className="pyy-top__yo">
            <span className="pyy-ava" aria-hidden="true">
              {instagram.replace(/[^a-z0-9]/g, "").charAt(0) || "@"}
            </span>
            <span>@{instagram}</span>
          </div>
          <Fuego racha={racha} />
          <a href={HOME} aria-label="Café Pa' Yo, ir al inicio" className="pyy-top__marca">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO} alt="" className="pyy-top__logo" />
          </a>
        </header>
        <main className={`pyy-main${ancho ? " pyy-main--ancho" : ""}`}>{children}</main>
      </div>
      <nav className="pyy-nav" aria-label="Principal">
        <a href={HOME} className="pyy-nav__marca">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO} alt="" />
          <span>Mi Pa&apos;Yo</span>
        </a>
        {TABS.map((t) => (
          <a key={t.tab} href={t.href} aria-current={t.tab === tab ? "page" : undefined} className={t.tab === "escanear" ? "pyy-nav__escanear" : undefined}>
            <span className="pyy-nav__ico">
              <Icono tab={t.tab} />
            </span>
            {t.label}
          </a>
        ))}
        {EXTRA.map((t) => (
          <a key={t.tab} href={t.href} aria-current={t.tab === tab ? "page" : undefined} className="pyy-nav__extra">
            <span className="pyy-nav__ico">
              <Icono tab={t.tab} />
            </span>
            {t.label}
          </a>
        ))}
      </nav>
    </div>
  );
}

/** Fonts + tokens for pages that sit outside the menu layout (the QR page). */
export const fuentes = `pym ${display.variable} ${body.variable}`;
