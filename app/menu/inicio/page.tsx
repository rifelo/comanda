import type { Metadata } from "next";
import Link from "next/link";
import { inicio, miles, puestoDe } from "@/lib/clientes/mi-payo";
import { cargarCliente, cargarEscaneos, cargarRanking } from "@/lib/clientes/mi-payo-db";
import { instagramDeSesion } from "@/lib/clientes/sesion";
import { menuContent } from "@/lib/menu/data";
import { favoritasDelMes, mesActual, podioDelMes, type Favorita, type Lider } from "@/lib/menu/home";
import { precioK } from "@/lib/menu/menu";
import "./inicio.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Café Pa' Yo — El café hecho para tu momento",
  description: "Café de especialidad en Yopal. Mira el menú, suma puntos con el QR de tu vaso y sube en el ranking.",
  alternates: { canonical: "/" },
};

const MENU = "/menu";
const PUNTOS = "/menu/puntos";
const RANKING = "/menu/puntos/ranking";
const LOGO = "/brand/payo-mark.svg";
const MANO = "/menu/art/mano-taza.svg";

/** Visítanos: set on Vercel; without an address the card says only the city. */
const DIRECCION = process.env.CAFE_ADDRESS?.trim() || null;
const HORARIO = process.env.CAFE_HOURS?.trim() || "6:00 a. m. a 8:00 p. m.";
const PREMIO_PRIMERO = process.env.PRIZE_FIRST_PLACE?.trim() || null;
const MAPA = `https://maps.google.com/?q=${encodeURIComponent(DIRECCION ? `${DIRECCION}, Yopal` : "Café Pa'Yo Yopal")}`;

interface Mio {
  instagram: string;
  puntos: number;
  puesto: number | null;
  bebidas: number;
  esteMes: number;
  semanas: number;
}

/** The phone mock in «Suma puntos»: the visitor's own numbers when the phone has an @, the design's example otherwise. */
const EJEMPLO: Mio = { instagram: "valen.gomez", puntos: 612, puesto: 7, bebidas: 86, esteMes: 14, semanas: 5 };

async function mio(): Promise<Mio | null> {
  const instagram = await instagramDeSesion();
  if (!instagram) return null;
  try {
    const org = menuContent.organizationId;
    const cliente = await cargarCliente(org, instagram);
    if (!cliente) return null;
    const [escaneos, ranking] = await Promise.all([cargarEscaneos(org, cliente.id), cargarRanking(org, "mes")]);
    const r = inicio(escaneos);
    return { instagram, puntos: cliente.puntos, puesto: puestoDe(ranking, cliente.id), bebidas: r.bebidas, esteMes: r.esteMes, semanas: r.racha };
  } catch (e) {
    console.error("[home mio]", e);
    return null;
  }
}

const inicial = (ig: string) => (ig.replace(/[^a-z0-9]/gi, "").charAt(0) || "@").toUpperCase();

function Seguro<T>(p: Promise<T>, vacio: T, donde: string): Promise<T> {
  return p.catch((e) => {
    console.error(`[home ${donde}]`, e);
    return vacio;
  });
}

/**
 * cafepayo.com's Home (the proxy rewrites "/" here), from the Claude Design
 * canvas «Mi Pa'Yo — app de clientes», boards «Home escritorio» and «Home
 * móvil»: one fluid page, 1080px wide at most.
 */
export default async function HomePage() {
  const ahora = new Date();
  const [favoritas, podio, yo] = await Promise.all([
    Seguro<Favorita[]>(favoritasDelMes(ahora), [], "favoritas"),
    Seguro<Lider[]>(podioDelMes(ahora), [], "podio"),
    mio(),
  ]);
  const mes = mesActual(ahora);
  const ig = menuContent.footer.instagram.replace(/^@/, "");
  const insta = `https://instagram.com/${ig}`;
  const muestra = yo ?? EJEMPLO;

  return (
    <div className="pyh">
      <header className="pyh-head">
        <div className="pyh-wrap pyh-head__in">
          <Link href="/" aria-label="Café Pa' Yo, inicio" className="pyh-marca">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO} alt="" />
            <span>Café Pa&apos; Yo</span>
          </Link>
          <nav aria-label="Principal" className="pyh-nav">
            <a href="#favoritas">Favoritas</a>
            <a href="#puntos">Puntos</a>
            <a href="#visitanos">Visítanos</a>
            <a href={MENU} className="pyh-btn pyh-btn--s">
              Ver el menú
            </a>
          </nav>
        </div>
      </header>

      <main>
        <section aria-label="Bienvenida" className="pyh-hero">
          <div className="pyh-wrap pyh-hero__in">
            <div className="pyh-hero__txt">
              <span className="pyh-k">Yopal, Casanare</span>
              <h1>{menuContent.header.titulo}</h1>
              <p>Pide en tu mesa y paga al final en caja. Escanea el QR de tu vaso y suma puntos con cada café.</p>
              <div className="pyh-acciones">
                <a href={MENU} className="pyh-btn">
                  Ver el menú
                </a>
                <a href={PUNTOS} className="pyh-btn pyh-btn--linea">
                  Mis puntos
                </a>
              </div>
            </div>
            <div className="pyh-hero__arte" aria-hidden="true">
              <div className="pyh-hero__sol" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={MANO} alt="" />
            </div>
          </div>
        </section>

        {favoritas.length > 0 && (
          <section id="favoritas" aria-labelledby="favoritas-t">
            <div className="pyh-wrap pyh-bloque">
              <div className="pyh-bloque__head">
                <div className="pyh-titulo">
                  <span className="pyh-k">{mes}</span>
                  <h2 id="favoritas-t">Las favoritas del mes</h2>
                </div>
                <a href={MENU} className="pyh-mas">
                  Ver todo el menú →
                </a>
              </div>
              <div className="pyh-favs">
                {favoritas.map((f) => (
                  <a key={f.sku} href={MENU} className="pyh-fav">
                    <div className="pyh-fav__arte" aria-hidden="true">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={MANO} alt="" />
                    </div>
                    <div className="pyh-fav__fila">
                      <span className="pyh-fav__nombre">{f.name}</span>
                      <span className="pyh-n pyh-fav__precio">${precioK(f.price)}</span>
                    </div>
                    <span className="pyh-meta">{f.nota}</span>
                  </a>
                ))}
              </div>
            </div>
          </section>
        )}

        <section id="puntos" aria-labelledby="puntos-t">
          <div className="pyh-wrap">
            <div className="pyh-puntos">
              <div className="pyh-puntos__txt">
                <div className="pyh-titulo">
                  <span className="pyh-k">Mis puntos</span>
                  <h2 id="puntos-t">Suma puntos con cada café</h2>
                </div>
                <ol className="pyh-pasos">
                  <li>
                    <span className="pyh-n">1</span>
                    <div>
                      <strong>Pide tu café</strong>
                      <span>En la mesa o en la barra, como siempre.</span>
                    </div>
                  </li>
                  <li>
                    <span className="pyh-n">2</span>
                    <div>
                      <strong>Escanea el QR de tu vaso</strong>
                      <span>Cada vaso trae un código único.</span>
                    </div>
                  </li>
                  <li>
                    <span className="pyh-n">3</span>
                    <div>
                      <strong>Suma puntos</strong>
                      <span>1 punto por cada $1.000. Míralos con tu usuario de Instagram.</span>
                    </div>
                  </li>
                </ol>
                <div className="pyh-acciones">
                  <a href={PUNTOS} className="pyh-btn">
                    Ver mis puntos
                  </a>
                </div>
              </div>
              <div className="pyh-puntos__mock">
                <div className="pyh-mock" aria-hidden="true">
                  <div className="pyh-mock__yo">
                    <span className="pyh-ava pyh-ava--s">{inicial(muestra.instagram)}</span>
                    <span>@{muestra.instagram}</span>
                  </div>
                  <div className="pyh-mock__puntos">
                    <span className="pyh-meta--xs">Mis puntos</span>
                    <span className="pyh-n pyh-mock__n">{miles(muestra.puntos)}</span>
                    {muestra.puesto && <span className="pyh-mock__puesto">#{muestra.puesto} del mes</span>}
                  </div>
                  <div className="pyh-mock__tiles">
                    <div>
                      <span className="pyh-n">{miles(muestra.bebidas)}</span>
                      <br />
                      <span className="pyh-meta--xs">bebidas</span>
                    </div>
                    <div>
                      <span className="pyh-n">{miles(muestra.esteMes)}</span>
                      <br />
                      <span className="pyh-meta--xs">este mes</span>
                    </div>
                    <div>
                      <span className="pyh-n">{miles(muestra.semanas)}</span>
                      <br />
                      <span className="pyh-meta--xs">semanas</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section aria-label="Ranking y visítanos">
          <div className="pyh-wrap pyh-bloque pyh-dos">
            <div className="pyh-card pyh-ranking">
              <div className="pyh-titulo">
                <span className="pyh-k">{mes}</span>
                <h2>Ranking Pa&apos;Yo</h2>
                <span className="pyh-meta pyh-meta--m">
                  Los que más café suman este mes.{PREMIO_PRIMERO ? ` Premio al #1: ${PREMIO_PRIMERO}` : ""}
                </span>
              </div>
              {podio.length > 0 ? (
                <ol className="pyh-lideres">
                  {podio.map((l) => (
                    <li key={l.instagram}>
                      <span className="pyh-n pyh-lideres__p">{l.puesto}</span>
                      <span className={`pyh-ava${l.puesto === 1 ? " pyh-ava--oro" : ""}`} aria-hidden="true">
                        {inicial(l.instagram)}
                      </span>
                      <span className="pyh-lideres__ig">@{l.instagram}</span>
                      <span className="pyh-lideres__pts">{miles(l.puntos)} pts</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="pyh-meta pyh-meta--m">Nadie ha sumado puntos este mes todavía. Escanea tu vaso y queda de primero.</p>
              )}
              <a href={RANKING} className="pyh-mas">
                Ver el ranking completo →
              </a>
            </div>

            <div id="visitanos" className="pyh-card pyh-visita">
              <div className="pyh-titulo">
                <span className="pyh-k">Visítanos</span>
                <h2>Tu pausa en Yopal</h2>
              </div>
              <div className="pyh-datos">
                <div>
                  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z" />
                    <circle cx="12" cy="10" r="2.5" />
                  </svg>
                  <span>{DIRECCION ? `${DIRECCION}, Yopal, Casanare` : "Yopal, Casanare"}</span>
                </div>
                <div>
                  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </svg>
                  <span>{HORARIO} · Lunes a domingo</span>
                </div>
                <div>
                  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="5" />
                    <circle cx="12" cy="12" r="4" />
                    <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" />
                  </svg>
                  <a href={insta} rel="noopener" className="pyh-fuerte">
                    @{ig}
                  </a>
                </div>
              </div>
              <div className="pyh-acciones">
                <a href={MAPA} rel="noopener" className="pyh-btn pyh-btn--linea">
                  Cómo llegar
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="pyh-pie">
        <div className="pyh-wrap pyh-pie__in">
          <div className="pyh-pie__firma">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO} alt="Café Pa' Yo" />
            <span>{menuContent.footer.tagline}</span>
          </div>
          <nav aria-label="Enlaces" className="pyh-pie__links">
            <a href={MENU}>Menú</a>
            <a href={PUNTOS}>Mis puntos</a>
            <a href={insta} rel="noopener">
              Instagram
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
