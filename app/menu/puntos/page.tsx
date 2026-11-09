import type { Metadata } from "next";
import { PESOS_POR_PUNTO } from "@/lib/calificaciones/calificaciones";
import { inicio, miles, puestoDe } from "@/lib/clientes/mi-payo";
import { cargarCliente, cargarEscaneos, cargarRanking } from "@/lib/clientes/mi-payo-db";
import { instagramDeSesion } from "@/lib/clientes/sesion";
import { menuContent } from "@/lib/menu/data";
import { salir } from "./actions";
import { Entrar } from "./puntos-client";
import { BASE, Icono, Pantalla } from "./shell";
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
  const [escaneos, filasMes] = cliente ? await Promise.all([cargarEscaneos(org, cliente.id), cargarRanking(org, "mes")]) : [[], []];
  const r = inicio(escaneos);
  const puesto = puestoDe(filasMes, cliente?.id ?? null);

  return (
    <Pantalla instagram={instagram} tab="inicio">
      <section aria-label="Tus puntos" className="pyy-puntos">
        <div className="pyy-puntos__fila">
          <span className="pyy-k pyy-puntos__k">Mis puntos</span>
          <a href={`${BASE}/ranking`} className="pyy-puntos__rank">
            {puesto ? `#${puesto} del mes` : "Ranking"}
          </a>
        </div>
        <span className="pyy-puntos__n">{miles(cliente?.puntos ?? 0)}</span>
        <span className="pyy-meta">Cada ${PESOS_POR_PUNTO.toLocaleString("es-CO")} que compras es 1 punto. Los sumas escaneando el QR de tu vaso.</span>
        <a href={`${BASE}/escanear`} className="pyy-btn pyy-btn--amarillo">
          <Icono tab="escanear" size={18} />
          Escanear mi vaso
        </a>
      </section>

      {cliente && escaneos.length > 0 ? (
        <>
          <section aria-label="Resumen" className="pyy-tres">
            <div className="pyy-tile">
              <span className="pyy-n">{r.bebidas}</span>
              <span>bebidas en total</span>
            </div>
            <div className="pyy-tile">
              <span className="pyy-n">{r.esteMes}</span>
              <span>este mes</span>
            </div>
            <div className="pyy-tile">
              <span className="pyy-n">{r.racha}</span>
              <span>{r.racha === 1 ? "semana de racha" : "semanas de racha"}</span>
            </div>
          </section>

          {r.favorito && (
            <a href={`${BASE}/insights`} className="pyy-fav">
              <div>
                <span className="pyy-k pyy-meta">Tu favorito</span>
                <span className="pyy-fav__nombre">{r.favorito.nombre}</span>
                <span className="pyy-meta">
                  {r.favorito.veces === 1 ? "1 vez" : `${r.favorito.veces} veces`} · {r.favorito.pct}% de lo que pides
                </span>
              </div>
              <span className="pyy-chip">Insights</span>
            </a>
          )}

          <section aria-labelledby="pyy-ult" className="pyy-lista">
            <h2 id="pyy-ult" className="pyy-h2">Últimos escaneos</h2>
            {r.ultimos.map((u, i) => (
              <div key={i} className="pyy-item">
                <div>
                  <b>{u.nombre}</b>
                  <span className="pyy-meta">
                    {u.cuando} · {u.valor}
                  </span>
                </div>
                <span className="pyy-chip">+{u.puntos}</span>
              </div>
            ))}
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
