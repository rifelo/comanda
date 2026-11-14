import type { Metadata } from "next";
import { PESOS_POR_PUNTO } from "@/lib/calificaciones/calificaciones";
import { artDeInsignia, coleccion, insignias, proximaInsignia, rachaDiasActual, rachaDiasMasLarga, semanaDeCafe } from "@/lib/clientes/coleccion";
import { inicio, miles, puestoDe } from "@/lib/clientes/mi-payo";
import { cargarCarta, cargarCliente, cargarEscaneos, cargarPodios, cargarRanking } from "@/lib/clientes/mi-payo-db";
import { HORA_FIN_MANANA, PREMIOS, esMananaDoble, progreso } from "@/lib/clientes/premios";
import { instagramDeSesion } from "@/lib/clientes/sesion";
import { menuContent } from "@/lib/menu/data";
import { salir } from "./actions";
import { Entrar } from "./puntos-client";
import { BASE, MANO, Pantalla } from "./shell";
import "./mi-payo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Mis puntos · Café Pa' Yo",
  description: "Escribe tu usuario de Instagram y mira cuántos puntos llevas en Café Pa' Yo.",
  alternates: { canonical: "/puntos" },
};

/**
 * «Mi Pa'Yo» home: cafepayo.com/puntos (the proxy rewrites it here). Public,
 * no session — the remembered @ picks the customer. Answers «¿cómo voy hoy?»:
 * points and the next reward, the morning double while it lasts, the streak
 * with this week's days, the next badge, the collection and the last cups.
 * Claude Design canvas «Mi Pa'Yo · rediseño» (2026-11-14).
 */
export default async function PuntosPage({ searchParams }: { searchParams: Promise<{ ir?: string }> }) {
  const instagram = await instagramDeSesion();
  if (!instagram) return <Entrar pesosPorPunto={PESOS_POR_PUNTO} ir={(await searchParams).ir ?? null} />;

  const org = menuContent.organizationId;
  const cliente = await cargarCliente(org, instagram);
  const [escaneos, filasMes, { carta, fuera }, podios] = await Promise.all([
    cliente ? cargarEscaneos(org, cliente.id) : Promise.resolve([]),
    cliente ? cargarRanking(org, "mes") : Promise.resolve([]),
    cargarCarta(org),
    cliente ? cargarPodios(org, cliente.id) : Promise.resolve([]),
  ]);
  const ahora = new Date();
  const r = inicio(escaneos, ahora);
  const puntos = cliente?.puntos ?? 0;
  const p = progreso(puntos);
  const tope = PREMIOS[PREMIOS.length - 1].puntos;
  const listo = p.disponibles[p.disponibles.length - 1];
  const col = coleccion(escaneos, carta, fuera);
  const badges = insignias(escaneos, carta, podios, fuera);
  const ganadas = badges.filter((b) => b.ganada);
  const proxima = proximaInsignia(badges);
  const racha = rachaDiasActual(escaneos, ahora);
  const record = rachaDiasMasLarga(escaneos);
  const semana = semanaDeCafe(escaneos, ahora);
  const puesto = puestoDe(filasMes, cliente?.id ?? null);

  return (
    <Pantalla instagram={instagram} tab="inicio" ancho>
      <div className="pyy-inicio">
        <div className="pyy-saludo">
          <h1 className="pyy-h1">Hola, @{instagram}</h1>
          <span className="pyy-meta">
            {r.bebidas > 0 ? `Llevas ${r.bebidas} ${r.bebidas === 1 ? "café" : "cafés"} con nosotros. El de hoy también cuenta.` : "Tu primer café con nosotros empieza tu colección."}
          </span>
        </div>

        <section aria-label="Mis puntos" className="pyy-hero">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={MANO} alt="" className="pyy-hero__mano" />
          <div className="pyy-hero__txt">
            <span className="pyy-hero__label">Mis puntos</span>
            <span className="pyy-hero__n">{miles(puntos)}</span>
            <span className="pyy-hero__meta">{p.siguiente ? `Te faltan ${p.faltan} para «${p.siguiente.titulo}»` : `¡Ya puedes canjear «${listo?.titulo}»!`}</span>
          </div>
          <div className="pyy-hero__camino">
            <div className="pyy-hero__barra" role="progressbar" aria-valuemin={0} aria-valuemax={tope} aria-valuenow={Math.min(puntos, tope)} aria-label={`${puntos} de ${tope} puntos`}>
              <span style={{ width: `${Math.min(100, Math.round((puntos / tope) * 100))}%` }} />
            </div>
            <div className="pyy-hero__hitos">
              <span>0</span>
              {PREMIOS.map((x) => (
                <span key={x.id}>{x.puntos}</span>
              ))}
            </div>
          </div>
          <a href={`${BASE}/premios`} className="pyy-hero__btn">
            {listo ? "Canjear un premio" : "Ver los premios"}
          </a>
          <span className="pyy-hero__regla">
            1 punto por cada ${PESOS_POR_PUNTO.toLocaleString("es-CO")}. Antes de las {HORA_FIN_MANANA}:00 a. m., el doble.
            {puesto ? ` Vas #${puesto} este mes.` : ""}
          </span>
        </section>

        <div className="pyy-lado">
          {esMananaDoble(ahora) && (
            <section aria-label="Mañana doble" className="pyy-doble">
              <svg aria-hidden="true" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" />
              </svg>
              <div className="pyy-col">
                <b>Mañana doble hasta las {HORA_FIN_MANANA}:00 a. m.</b>
                <span>Lo que pidas ahora suma el doble de puntos.</span>
              </div>
            </section>
          )}

          <section aria-label="Mi racha" className="pyy-card">
            <div className="pyy-seccion__head">
              <h2 className="pyy-h2">{racha > 0 ? `${racha} ${racha === 1 ? "día seguido" : "días seguidos"}` : "Empieza una racha"}</h2>
              {record > 0 && <span className="pyy-meta">Tu récord: {record}</span>}
            </div>
            <ol className="pyy-semana" aria-label="Esta semana">
              {semana.map((d) => (
                <li key={d.label} className={`${d.hecho ? "pyy-dia--hecho" : ""}${d.hoy ? " pyy-dia--hoy" : ""}`}>
                  <span aria-hidden="true" />
                  <b>{d.hoy ? "Hoy" : d.label}</b>
                  <span className="pyy-sr">{d.hecho ? "con café" : d.futuro ? "por venir" : "sin café"}</span>
                </li>
              ))}
            </ol>
            <span className="pyy-meta">{racha > 0 ? "Ven mañana y súmale un día." : "Un café hoy y otro mañana: así empieza."}</span>
          </section>
        </div>

        <div className="pyy-bloque">
          {proxima && proxima.progreso && (
            <a href={`${BASE}/coleccion`} className="pyy-proxima" aria-label={`Tu próxima insignia: ${proxima.nombre}, ${proxima.progreso.actual} de ${proxima.progreso.meta}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={artDeInsignia(proxima.id)} alt="" width={68} height={68} />
              <div className="pyy-col" style={{ flexGrow: 1, gap: 6 }}>
                <span className="pyy-meta--s" style={{ fontWeight: 700 }}>{proxima.ganada ? "Tu próximo nivel" : "Tu próxima insignia"}</span>
                <b>{proxima.ganada ? `${proxima.nombre} → ${proxima.progreso.meta}` : proxima.nombre}</b>
                <div className="pyy-prog__barra" aria-hidden="true">
                  <span style={{ width: `${Math.round((proxima.progreso.actual / proxima.progreso.meta) * 100)}%` }} />
                </div>
                <span className="pyy-meta">
                  {proxima.progreso.actual} de {proxima.progreso.meta} · {proxima.detalle}
                </span>
              </div>
            </a>
          )}

          <section aria-labelledby="pyy-col" className="pyy-lista">
            <div className="pyy-seccion__head">
              <h2 id="pyy-col" className="pyy-h2">Mi colección</h2>
              <a href={`${BASE}/coleccion`} className="pyy-enlace">
                {col.descubiertas} de {col.carta} · ver todo
              </a>
            </div>
            {ganadas.length > 0 ? (
              <ul className="pyy-stickers">
                {ganadas.slice(0, 4).map((b) => (
                  <li key={b.id}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={artDeInsignia(b.id)} alt={`Insignia ${b.nombre}`} width={96} height={96} loading="lazy" />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="pyy-vacio">Tus insignias aparecen aquí. La primera llega con tu primer vaso escaneado.</p>
            )}
          </section>
        </div>

        <section aria-labelledby="pyy-ult" className="pyy-ultimos">
          <div className="pyy-seccion__head">
            <h2 id="pyy-ult" className="pyy-h2">Últimos cafés</h2>
            <a href={`${BASE}/insights`} className="pyy-enlace">Estadísticas</a>
          </div>
          {r.ultimos.length > 0 ? (
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
          ) : (
            <p className="pyy-vacio">
              Con <strong>@{instagram}</strong> todavía no hemos sumado nada. Cuando pidas, escanea el QR de tu vaso y escribe tu usuario.
            </p>
          )}
        </section>
      </div>

      <form action={salir} style={{ alignSelf: "center" }}>
        <button type="submit" className="pyy-link">
          No soy @{instagram} · cambiar de usuario
        </button>
      </form>
    </Pantalla>
  );
}
