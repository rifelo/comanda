import type { Metadata } from "next";
import { PESOS_POR_PUNTO } from "@/lib/calificaciones/calificaciones";
import { miles, puestoDe } from "@/lib/clientes/mi-payo";
import { cargarCliente, cargarRanking } from "@/lib/clientes/mi-payo-db";
import { instagramDeSesion } from "@/lib/clientes/sesion";
import { menuContent } from "@/lib/menu/data";
import { Icono } from "../puntos/shell";
import "./inicio.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Café Pa' Yo",
  description: "El café hecho para tu momento. Mira el menú, suma puntos con el QR de tu vaso y sube en el ranking.",
  alternates: { canonical: "/" },
};

const ART = "/menu/art";
const PUNTOS = "/menu/puntos";

function Flecha() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
function Menu() {
  return (
    <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h13v5a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6zM17 9h1.5a2.5 2.5 0 0 1 0 5H17M8 2v3M12 2v3" />
    </svg>
  );
}
function Insta() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" />
    </svg>
  );
}

/**
 * cafepayo.com's front door (the proxy rewrites "/" here): from it the
 * customer picks the menu, their points, the ranking or their insights. A
 * phone that already gave its @ sees its points right away.
 */
export default async function InicioPage() {
  const c = menuContent;
  const instagram = await instagramDeSesion();
  let yo: { puntos: number; puesto: number | null } | null = null;
  if (instagram) {
    try {
      const cliente = await cargarCliente(c.organizationId, instagram);
      yo = { puntos: cliente?.puntos ?? 0, puesto: cliente ? puestoDe(await cargarRanking(c.organizationId, "mes"), cliente.id) : null };
    } catch (e) {
      console.error("[inicio cafepayo]", e);
    }
  }
  const ig = c.footer.instagram.replace(/^@/, "");

  return (
    <div className="pym-page pyl">
      <header className="pym-header pyl-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${ART}/cafe-payo-logo-principal.svg`} alt="Café Pa' Yo" className="pym-header__logo" />
        <h1 className="pym-header__title">{c.header.titulo}</h1>
        <p className="pym-header__text">¿Qué quieres hacer hoy?</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${ART}/mano-taza.svg`} alt="" className="pym-art pym-header__art" />
      </header>

      <main className="pyl-main">
        <a href="/menu" className="pyl-menu">
          <span className="pyl-menu__icon">
            <Menu />
          </span>
          <span className="pyl-txt">
            <span className="pyl-menu__t">Ver el menú</span>
            <span className="pyl-menu__s">Bebidas, postres y precios de hoy. Pide en tu mesa y paga en caja.</span>
          </span>
          <Flecha />
        </a>

        {instagram && yo ? (
          <a href={PUNTOS} className="pyl-yo">
            <span className="pyl-txt">
              <span className="pyl-k">Hola, @{instagram}</span>
              <span className="pyl-yo__n">
                {miles(yo.puntos)} <span>{yo.puntos === 1 ? "punto" : "puntos"}</span>
              </span>
              <span className="pyl-yo__s">{yo.puesto ? `#${yo.puesto} en el ranking del mes` : yo.puntos > 0 ? "Este mes aún no sumas: tu próximo vaso te mete al ranking" : "Escanea tu vaso y empieza a subir en el ranking"}</span>
            </span>
            <Flecha />
          </a>
        ) : (
          <a href={PUNTOS} className="pyl-yo">
            <span className="pyl-txt">
              <span className="pyl-k">Mis puntos</span>
              <span className="pyl-yo__t">Cada ${PESOS_POR_PUNTO.toLocaleString("es-CO")} es 1 punto</span>
              <span className="pyl-yo__s">Escribe tu usuario de Instagram y mira cuántos llevas.</span>
            </span>
            <Flecha />
          </a>
        )}

        <nav aria-label="Más de Café Pa' Yo" className="pyl-grid">
          <a href={`${PUNTOS}/ranking`} className="pyl-door">
            <Icono tab="ranking" size={26} />
            <span className="pyl-door__t">Ranking</span>
            <span className="pyl-door__s">Quién toma más café este mes</span>
          </a>
          <a href={`${PUNTOS}/insights`} className="pyl-door">
            <Icono tab="insights" size={26} />
            <span className="pyl-door__t">Mis insights</span>
            <span className="pyl-door__s">Qué y cuándo tomas</span>
          </a>
          <a href={`${PUNTOS}/escanear`} className="pyl-door">
            <Icono tab="escanear" size={26} />
            <span className="pyl-door__t">Escanear mi vaso</span>
            <span className="pyl-door__s">Así sumas tus puntos</span>
          </a>
          <a href={`https://www.instagram.com/${ig}`} className="pyl-door" rel="noopener">
            <Insta />
            <span className="pyl-door__t">Instagram</span>
            <span className="pyl-door__s">Síguenos en @{ig}</span>
          </a>
        </nav>
      </main>

      <footer className="pym-footer pyl-foot">
        <p className="pym-footer__tagline">{c.footer.tagline}</p>
        <p className="pym-footer__text">¿Dudas? Pregúntale a quien te atiende.</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${ART}/mano-taza-amarilla.svg`} alt="" className="pym-art pym-footer__art" />
      </footer>
    </div>
  );
}
