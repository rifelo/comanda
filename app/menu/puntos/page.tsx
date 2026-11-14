import type { Metadata } from "next";
import { PESOS_POR_PUNTO } from "@/lib/calificaciones/calificaciones";
import { inicio, miles, puestoDe } from "@/lib/clientes/mi-payo";
import { cargarCarta, cargarCliente, cargarEscaneos, cargarRanking } from "@/lib/clientes/mi-payo-db";
import { coleccion } from "@/lib/clientes/coleccion";
import { instagramDeSesion } from "@/lib/clientes/sesion";
import { menuContent } from "@/lib/menu/data";
import { HORA_FIN_MANANA, progreso } from "@/lib/clientes/premios";
import { Progreso } from "./progreso";
import { salir } from "./actions";
import { Entrar } from "./puntos-client";
import { BASE, Icono, MANO, Pantalla } from "./shell";
import "./mi-payo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Mis puntos · Café Pa' Yo",
  description: "Escribe tu usuario de Instagram y mira cuántos puntos llevas en Café Pa' Yo.",
  alternates: { canonical: "/puntos" },
};

/** «Mi Pa'Yo» home: cafepayo.com/puntos (the proxy rewrites it here). Public, no session — the remembered @ picks the customer. */
export default async function PuntosPage({ searchParams }: { searchParams: Promise<{ ir?: string }> }) {
  const instagram = await instagramDeSesion();
  if (!instagram) return <Entrar pesosPorPunto={PESOS_POR_PUNTO} ir={(await searchParams).ir ?? null} />;

  const org = menuContent.organizationId;
  const cliente = await cargarCliente(org, instagram);
  const [escaneos, filasMes, carta] = await Promise.all([
    cliente ? cargarEscaneos(org, cliente.id) : Promise.resolve([]),
    cliente ? cargarRanking(org, "mes") : Promise.resolve([]),
    cargarCarta(org),
  ]);
  const col = coleccion(escaneos, carta.carta, carta.fuera);
  const r = inicio(escaneos);
  const puesto = puestoDe(filasMes, cliente?.id ?? null);

  return (
    <Pantalla instagram={instagram} tab="inicio">
      <section aria-label="Mis puntos" className="pyy-puntos">
        <div className="pyy-puntos__fila">
          <div className="pyy-col">
            <span className="pyy-meta">Mis puntos</span>
            <span className="pyy-puntos__n">{miles(cliente?.puntos ?? 0)}</span>
          </div>
          <a href={`${BASE}/ranking`} className="pyy-pill">
            {puesto ? `#${puesto} del mes` : "Ranking"}
          </a>
        </div>
        <span className="pyy-puntos__txt">
          Cada ${PESOS_POR_PUNTO.toLocaleString("es-CO")} que compras es 1 punto. Antes de las {HORA_FIN_MANANA}:00 a. m., el doble.
        </span>
        <a href={`${BASE}/escanear`} className="pyy-accion">
          <Icono tab="escanear" size={18} />
          <span>Escanear mi vaso</span>
          <Flecha />
        </a>
      </section>

      <Progreso p={progreso(cliente?.puntos ?? 0)} puntos={cliente?.puntos ?? 0} />

      <a href={`${BASE}/coleccion`} className="pyy-fav">
        <div className="pyy-fav__art" aria-hidden="true" style={{ alignItems: "center" }}>
          <Icono tab="coleccion" size={26} />
        </div>
        <div className="pyy-col" style={{ flexGrow: 1 }}>
          <span className="pyy-fav__nombre">Mi colección</span>
          <span className="pyy-meta">
            {col.bebidas} {col.bebidas === 1 ? "bebida" : "bebidas"} · {col.descubiertas} de {col.carta} de la carta descubiertas
          </span>
        </div>
        <Flecha />
      </a>

      {cliente && escaneos.length > 0 ? (
        <>
          <section aria-label="Resumen" className="pyy-tres">
            <div className="pyy-tile">
              <span className="pyy-n">{r.bebidas}</span>
              <span className="pyy-meta--s">{r.bebidas === 1 ? "bebida" : "bebidas"}</span>
            </div>
            <div className="pyy-tile">
              <span className="pyy-n">{r.esteMes}</span>
              <span className="pyy-meta--s">este mes</span>
            </div>
            <div className="pyy-tile">
              <span className="pyy-n">{r.racha}</span>
              <span className="pyy-meta--s">{r.racha === 1 ? "semana" : "semanas"}</span>
            </div>
          </section>

          {r.favorito && (
            <a href={`${BASE}/insights`} className="pyy-fav">
              <div className="pyy-fav__art" aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={MANO} alt="" />
              </div>
              <div className="pyy-col" style={{ flexGrow: 1 }}>
                <span className="pyy-meta--s">Tu favorito</span>
                <span className="pyy-fav__nombre">{r.favorito.nombre}</span>
                <span className="pyy-meta">
                  {r.favorito.veces === 1 ? "1 vez" : `${r.favorito.veces} veces`} · {r.favorito.pct}% de lo que pides
                </span>
              </div>
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </a>
          )}

          <section aria-labelledby="pyy-ult" className="pyy-lista">
            <div className="pyy-seccion__head">
              <h2 id="pyy-ult" className="pyy-h2">Últimos escaneos</h2>
              <a href={`${BASE}/insights`}>Ver todo</a>
            </div>
            <div>
              {r.ultimos.map((u, i) => (
                <div key={i} className="pyy-item">
                  <div>
                    <b>{u.nombre}</b>
                    <span className="pyy-meta--s">
                      {u.cuando} · {u.valor}
                    </span>
                  </div>
                  <span className="pyy-chip">+{u.puntos}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : (
        <p className="pyy-vacio">
          Con <strong>@{instagram}</strong> todavía no hemos sumado nada. Cuando pidas, escanea el QR de tu vaso y escribe tu usuario: así empiezas a
          sumar puntos.
        </p>
      )}

      <form action={salir} style={{ alignSelf: "center" }}>
        <button type="submit" className="pyy-link">
          No soy @{instagram} · cambiar de usuario
        </button>
      </form>
    </Pantalla>
  );
}

function Flecha() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
